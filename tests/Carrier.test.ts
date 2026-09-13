import { AirBaseExecution } from "../src/core/execution/AirBaseExecution";
import { FighterJetExecution } from "../src/core/execution/FighterJetExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let water: number;
let land: number[];

function carrierAt(tile: number) {
  const unit = me.buildUnit(UnitType.Carrier, tile, { patrolTile: tile });
  const exec = new AirBaseExecution(unit);
  exec.init(game, 0);
  return { unit, exec };
}

describe("Carrier", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    ]);
    me = game.player("me_id");
    me.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;
    land = [];
    water = -1;
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
        else if (water < 0 && game.isWater(t)) water = t;
      }
    }
    for (const t of land) me.conquer(t);
  });

  test("launches fighters and interceptors", () => {
    const { exec } = carrierAt(water);
    expect(exec.canLaunch(UnitType.FighterJet)).toBe(true);
    expect(exec.canLaunch(UnitType.Interceptor)).toBe(true);
  });

  test("has no runway for heavy or civilian traffic", () => {
    const { exec } = carrierAt(water);
    expect(exec.canLaunch(UnitType.TransportJet)).toBe(false);
    expect(exec.canLaunch(UnitType.CargoJet)).toBe(false);
    expect(exec.canLaunch(UnitType.Airliner)).toBe(false);
  });

  test("its aircraft range matches an airstrip's", () => {
    const { exec } = carrierAt(water);
    const strip = game.config().unitInfo(UnitType.Airstrip).range ?? 0;
    expect(exec.range()).toBe(strip);
  });

  test("it is the most expensive and toughest hull afloat", () => {
    const c = game.config().unitInfo(UnitType.Carrier);
    const w = game.config().unitInfo(UnitType.Warship);
    expect(c.maxHealth).toBeGreaterThan(w.maxHealth ?? 0);
    expect(c.cost(game, me)).toBeGreaterThan(w.cost(game, me));
  });

  test("it is slower than every other ship — it needs escorts", () => {
    const c = game.config().unitInfo(UnitType.Carrier).speed ?? 0;
    const d = game.config().unitInfo(UnitType.Destroyer).speed ?? 0;
    const cv = game.config().unitInfo(UnitType.Corvette).speed ?? 0;
    expect(c).toBeLessThan(d);
    expect(c).toBeLessThan(cv);
  });

  test("fighters homed to a carrier follow it as it moves", () => {
    // The point of a carrier: its aircraft's operating radius is anchored to
    // a hull that can reposition, not to a fixed point on the map.
    const { unit: carrier } = carrierAt(water);
    const jet = me.buildUnit(UnitType.FighterJet, water, {
      patrolTile: water,
      homeBase: carrier,
    });
    const exec = new FighterJetExecution(jet, carrier, water);
    exec.init(game, 0);

    exec.tick(1);
    expect(jet.isActive()).toBe(true);

    // Move the carrier; the jet is still in range because range is measured
    // from the hull's current tile.
    const far = land[land.length - 1];
    carrier.move(far);
    exec.tick(2);
    expect(jet.isActive()).toBe(true);
  });
});
