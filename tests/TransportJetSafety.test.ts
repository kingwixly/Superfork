import { TransportJetExecution } from "../src/core/execution/TransportJetExecution";
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
let water: number;

describe("Transport jet safety", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    me.addGold(1_000_000_000n);
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
    me.buildUnit(UnitType.Airfield, land[0], {});
  });

  test("an ocean target is refused at build time", () => {
    // conquer() throws on water, and that exception kills the worker - a
    // server crash any player could trigger by misclicking the sea.
    expect(me.canBuild(UnitType.TransportJet, water)).toBe(false);
  });

  test("a land target is accepted", () => {
    expect(me.canBuild(UnitType.TransportJet, land[20])).not.toBe(false);
  });

  test("landing on water is refused by the execution too", () => {
    // Independent of canBuild, so no other route can reach conquer(water).
    const jet = me.buildUnit(UnitType.TransportJet, land[0], { troops: 100 });
    const exec = new TransportJetExecution(jet, undefined, water, me);
    exec.init(game, 0);

    expect(() => {
      for (let i = 0; i < 500 && exec.isActive(); i++) exec.tick(i);
    }).not.toThrow();
    expect(jet.isActive()).toBe(false);
  });

  test("an assault seizes a beachhead, not a single tile", () => {
    const foe = game.player("foe_id");
    const target = land[land.length - 1];
    for (const t of land.slice(-60)) foe.conquer(t);
    const before = foe.numTilesOwned();

    const jet = me.buildUnit(UnitType.TransportJet, land[0], { troops: 500 });
    const exec = new TransportJetExecution(jet, undefined, target, me);
    exec.init(game, 0);
    for (let i = 0; i < 500 && exec.isActive(); i++) exec.tick(i);

    // More than one tile changed hands, so the defender cannot erase the
    // landing with a single tick of border pressure.
    expect(before - foe.numTilesOwned()).toBeGreaterThan(1);
  });
});
