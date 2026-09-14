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
let land: number[];

describe("Player air launch", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    ]);
    me = game.player("me_id");
    me.addGold(1_000_000_000n);
    game.config().structureMinDist = () => 1;
    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    for (const t of land) me.conquer(t);
  });

  test("with no air base at all, nothing can launch", () => {
    // This is what shipped: aircraft were never buildable, so the whole air
    // layer was unreachable for a player. Now it is buildable but correctly
    // refused until you own somewhere to fly from.
    for (const t of [
      UnitType.FighterJet,
      UnitType.Interceptor,
      UnitType.TransportJet,
    ]) {
      expect(me.canBuild(t, land[0])).toBe(false);
    }
  });

  test("an airstrip enables fighters only", () => {
    me.buildUnit(UnitType.Airstrip, land[0], {});
    expect(me.canBuild(UnitType.FighterJet, land[5])).not.toBe(false);
    // An airstrip has no runway for heavy transport.
    expect(me.canBuild(UnitType.TransportJet, land[5])).toBe(false);
  });

  test("an airfield enables transports", () => {
    me.buildUnit(UnitType.Airfield, land[0], {});
    expect(me.canBuild(UnitType.TransportJet, land[5])).not.toBe(false);
  });

  test("an international airport enables everything", () => {
    me.buildUnit(UnitType.InternationalAirport, land[0], {});
    for (const t of [
      UnitType.FighterJet,
      UnitType.Interceptor,
      UnitType.TransportJet,
    ]) {
      expect(me.canBuild(t, land[5])).not.toBe(false);
    }
  });

  test("aircraft spawn AT the base, not at the clicked tile", () => {
    const baseTile = land[0];
    me.buildUnit(UnitType.Airstrip, baseTile, {});
    const target = land[land.length - 1];

    // The click says where to go; the spawn is the base.
    expect(me.canBuild(UnitType.FighterJet, target)).toBe(baseTile);
  });

  test("it picks the base nearest the target", () => {
    me.buildUnit(UnitType.Airstrip, land[0], {});
    const nearer = land[land.length - 2];
    me.buildUnit(UnitType.Airstrip, nearer, {});

    const target = land[land.length - 1];
    expect(me.canBuild(UnitType.FighterJet, target)).toBe(nearer);
  });

  test("a base under construction cannot launch", () => {
    const base = me.buildUnit(UnitType.Airstrip, land[0], {});
    base.setUnderConstruction(true);
    expect(me.canBuild(UnitType.FighterJet, land[5])).toBe(false);
  });

  test("an EMP-disabled base cannot launch", () => {
    const base = me.buildUnit(UnitType.Airstrip, land[0], {});
    base.disable(game.ticks() + 100);
    expect(me.canBuild(UnitType.FighterJet, land[5])).toBe(false);
  });
});
