import { AirBaseExecution } from "../src/core/execution/AirBaseExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let player: Player;

function baseAt(type: UnitType, x: number, y: number) {
  const unit = player.buildUnit(type, game.ref(x, y), {});
  const exec = new AirBaseExecution(unit);
  exec.init(game, 0);
  return { unit, exec };
}

describe("Air bases", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("player", PlayerType.Human, null, "player_id"),
    ]);
    player = game.player("player_id");
    player.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) player.conquer(t);
      }
    }
  });

  test("airstrip launches fighters only", () => {
    const { exec } = baseAt(UnitType.Airstrip, 7, 10);
    expect(exec.canLaunch(UnitType.FighterJet)).toBe(true);
    expect(exec.canLaunch(UnitType.TransportJet)).toBe(false);
    expect(exec.canLaunch(UnitType.Airliner)).toBe(false);
  });

  test("airfield launches military transport and its own fighter cover", () => {
    const { exec } = baseAt(UnitType.Airfield, 7, 12);
    expect(exec.canLaunch(UnitType.TransportJet)).toBe(true);
    expect(exec.canLaunch(UnitType.FighterJet)).toBe(true);
    // Civilian traffic belongs to airports, not military fields.
    expect(exec.canLaunch(UnitType.CargoJet)).toBe(false);
    expect(exec.canLaunch(UnitType.Airliner)).toBe(false);
  });

  test("international airport launches everything", () => {
    const { exec } = baseAt(UnitType.InternationalAirport, 7, 14);
    for (const t of [
      UnitType.FighterJet,
      UnitType.TransportJet,
      UnitType.CargoJet,
      UnitType.Airliner,
      UnitType.Interceptor,
    ]) {
      expect(exec.canLaunch(t)).toBe(true);
    }
  });

  test("range comes from the spec table and grows with capability", () => {
    const strip = baseAt(UnitType.Airstrip, 7, 10);
    const field = baseAt(UnitType.Airfield, 7, 12);
    const port = baseAt(UnitType.InternationalAirport, 7, 14);
    expect(strip.exec.range()).toBeGreaterThan(0);
    expect(field.exec.range()).toBeGreaterThan(strip.exec.range());
    expect(port.exec.range()).toBeGreaterThan(field.exec.range());
  });

  test("air bases are capturable structures", () => {
    const { unit } = baseAt(UnitType.Airfield, 7, 12);
    expect(unit.isActive()).toBe(true);
    expect(player.units(UnitType.Airfield).length).toBe(1);
  });
});
