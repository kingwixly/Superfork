import { CivilianAircraftExecution } from "../src/core/execution/CivilianAircraftExecution";
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
let them: Player;
let land: number[];

describe("Civilian air traffic", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("them", PlayerType.Human, null, "them_id"),
    ]);
    me = game.player("me_id");
    them = game.player("them_id");
    me.addGold(100_000_000n);
    them.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;
    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    const half = Math.floor(land.length / 2);
    for (const t of land.slice(0, half)) me.conquer(t);
    for (const t of land.slice(half)) them.conquer(t);
  });

  function route(kind: UnitType) {
    const src = me.buildUnit(UnitType.InternationalAirport, land[0], {});
    const dst = them.buildUnit(
      UnitType.InternationalAirport,
      land[land.length - 1],
      {},
    );
    const jet = me.buildUnit(kind, land[0], {
      targetUnit: dst,
      homeBase: src,
    });
    const exec = new CivilianAircraftExecution(jet, src, dst);
    exec.init(game, 0);
    return { src, dst, jet, exec };
  }

  test("a closed nation refuses non-allied civilian flights", () => {
    expect(them.acceptsCivilianFlightsFrom(me)).toBe(false);
  });

  test("opening both border trade and public airports accepts them", () => {
    them.setBorderPolicy(true, true);
    expect(them.acceptsCivilianFlightsFrom(me)).toBe(true);
  });

  test("opening only one half is not enough", () => {
    them.setBorderPolicy(true, false);
    expect(them.acceptsCivilianFlightsFrom(me)).toBe(false);
    them.setBorderPolicy(false, true);
    expect(them.acceptsCivilianFlightsFrom(me)).toBe(false);
  });

  test("a sanction overrides an open border policy", () => {
    them.setBorderPolicy(true, true);
    them.addSanction(me);
    expect(them.acceptsCivilianFlightsFrom(me)).toBe(false);
  });

  test("a completed cargo flight pays the operator", () => {
    them.setBorderPolicy(true, true);
    const { exec } = route(UnitType.CargoJet);
    const before = me.gold();
    for (let i = 0; i < 800 && exec.isActive(); i++) exec.tick(i);
    expect(me.gold()).toBeGreaterThan(before);
  });

  test("an international route pays both ends", () => {
    them.setBorderPolicy(true, true);
    const { exec } = route(UnitType.CargoJet);
    const before = them.gold();
    for (let i = 0; i < 800 && exec.isActive(); i++) exec.tick(i);
    expect(them.gold()).toBeGreaterThan(before);
  });

  test("airliners pay less per flight than cargo", () => {
    them.setBorderPolicy(true, true);

    const cargo = route(UnitType.CargoJet);
    const beforeCargo = me.gold();
    for (let i = 0; i < 800 && cargo.exec.isActive(); i++) cargo.exec.tick(i);
    const cargoEarned = me.gold() - beforeCargo;

    const air = route(UnitType.Airliner);
    const beforeAir = me.gold();
    for (let i = 0; i < 800 && air.exec.isActive(); i++) air.exec.tick(i);
    const airEarned = me.gold() - beforeAir;

    expect(airEarned).toBeLessThan(cargoEarned);
    expect(airEarned).toBeGreaterThan(0n);
  });

  test("a flight diverts home if the destination closes mid-air", () => {
    them.setBorderPolicy(true, true);
    const { exec, jet } = route(UnitType.CargoJet);
    exec.tick(1);
    // Destination slams the door after departure.
    them.addSanction(me);
    for (let i = 0; i < 800 && exec.isActive(); i++) exec.tick(i);
    // It is not paid, but it is not silently deleted either.
    expect(jet.owner()).toBe(me);
  });
});
