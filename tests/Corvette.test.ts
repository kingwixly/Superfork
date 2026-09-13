import { CorvetteExecution } from "../src/core/execution/CorvetteExecution";
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
let ally: Player;
let foe: Player;
let water: number;
let land: number[];

function corvetteAt(owner: Player, tile: number) {
  return owner.buildUnit(UnitType.Corvette, tile, { patrolTile: tile });
}

describe("Corvette", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("ally", PlayerType.Human, null, "ally_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    ally = game.player("ally_id");
    foe = game.player("foe_id");
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

  test("the owner can load troops onto it", () => {
    const c = corvetteAt(me, water);
    const before = me.troops();
    const moved = CorvetteExecution.load(game, c, me, 500);
    expect(moved).toBe(500);
    expect(c.troops()).toBe(500);
    expect(me.troops()).toBe(before - 500);
  });

  test("an ally can load troops onto it", () => {
    const req = me.createAllianceRequest(ally);
    req?.accept();
    expect(me.isFriendly(ally)).toBe(true);
    const c = corvetteAt(me, water);
    expect(CorvetteExecution.canLoad(c, ally)).toBe(true);
  });

  test("an enemy cannot", () => {
    const c = corvetteAt(me, water);
    expect(CorvetteExecution.canLoad(c, foe)).toBe(false);
  });

  test("capacity is bounded — it cannot absorb an army", () => {
    const c = corvetteAt(me, water);
    const moved = CorvetteExecution.load(game, c, me, 10_000_000);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(me.troops() + moved);
  });

  test("it refuses to deploy when a port is closer to the target", () => {
    // Put a port right on the target; the corvette is far away.
    let shore = -1;
    for (const t of land) {
      if (game.isShore(t)) {
        shore = t;
        break;
      }
    }
    me.buildUnit(UnitType.Port, shore, {});
    const c = corvetteAt(me, water);
    CorvetteExecution.load(game, c, me, 300);
    expect(CorvetteExecution.deploy(game, c, shore)).toBe(false);
    expect(c.troops()).toBe(300);
  });

  test("it deploys when it is the closest staging point", () => {
    const c = corvetteAt(me, water);
    CorvetteExecution.load(game, c, me, 300);
    // No ports at all, so the corvette is trivially closest.
    expect(CorvetteExecution.deploy(game, c, land[0])).toBe(true);
    expect(c.troops()).toBe(0);
  });

  test("the hull survives the landing — it is a reusable platform", () => {
    const c = corvetteAt(me, water);
    CorvetteExecution.load(game, c, me, 300);
    CorvetteExecution.deploy(game, c, land[0]);
    expect(c.isActive()).toBe(true);
  });

  test("an empty corvette cannot deploy", () => {
    const c = corvetteAt(me, water);
    expect(CorvetteExecution.deploy(game, c, land[0])).toBe(false);
  });

  test("it is the weakest and cheapest combat hull", () => {
    const cv = game.config().unitInfo(UnitType.Corvette);
    const d = game.config().unitInfo(UnitType.Destroyer);
    const w = game.config().unitInfo(UnitType.Warship);
    expect(cv.maxHealth).toBeLessThan(d.maxHealth ?? 0);
    expect(cv.maxHealth).toBeLessThan(w.maxHealth ?? 0);
    expect(cv.cost(game, me)).toBeLessThan(d.cost(game, me));
  });
});
