import { InterceptorExecution } from "../src/core/execution/InterceptorExecution";
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
let foe: Player;
let land: number[];

function interceptorAt(spot: number, base: number) {
  const airstrip = me.buildUnit(UnitType.Airstrip, base, {});
  const unit = me.buildUnit(UnitType.Interceptor, spot, { patrolTile: spot });
  const exec = new InterceptorExecution(unit, airstrip, spot);
  exec.init(game, 0);
  return { unit, exec };
}

describe("Interceptor", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    foe = game.player("foe_id");
    me.addGold(100_000_000n);
    foe.addGold(100_000_000n);
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

  test("destroys an incoming atom bomb", () => {
    const spot = land[4];
    const { exec } = interceptorAt(spot, land[0]);
    const nuke = foe.buildUnit(UnitType.AtomBomb, spot, {
      targetTile: spot,
      trajectory: [],
    });

    exec.tick(1);

    expect(nuke.isActive()).toBe(false);
  });

  test("destroys a hydrogen bomb", () => {
    const spot = land[5];
    const { exec } = interceptorAt(spot, land[0]);
    const nuke = foe.buildUnit(UnitType.HydrogenBomb, spot, {
      targetTile: spot,
      trajectory: [],
    });

    exec.tick(1);

    expect(nuke.isActive()).toBe(false);
  });

  test("prefers an unseparated MIRV over a closer atom bomb", () => {
    // The signature behaviour: one MIRV kill removes 350 warheads, so it
    // outranks anything else in range regardless of distance.
    const spot = land[6];
    const { exec } = interceptorAt(spot, land[0]);
    const atom = foe.buildUnit(UnitType.AtomBomb, spot, {
      targetTile: spot,
      trajectory: [],
    });
    const mirv = foe.buildUnit(UnitType.MIRV, spot, {
      targetTile: spot,
      targetPlayer: me,
    });

    exec.tick(1);

    expect(mirv.isActive()).toBe(false);
    expect(atom.isActive()).toBe(true);
  });

  test("intercepts superfork warheads too", () => {
    const spot = land[7];
    const { exec } = interceptorAt(spot, land[0]);
    const emp = foe.buildUnit(UnitType.EMPBomb, spot, {
      targetTile: spot,
      trajectory: [],
    });

    exec.tick(1);

    expect(emp.isActive()).toBe(false);
  });

  test("ignores friendly munitions", () => {
    const spot = land[8];
    const { exec } = interceptorAt(spot, land[0]);
    const mine = me.buildUnit(UnitType.AtomBomb, spot, {
      targetTile: spot,
      trajectory: [],
    });

    exec.tick(1);

    expect(mine.isActive()).toBe(true);
  });

  test("carries less health than a fighter — it cannot win a dogfight", () => {
    const fighter = game.config().unitInfo(UnitType.FighterJet).maxHealth ?? 0;
    const interceptor =
      game.config().unitInfo(UnitType.Interceptor).maxHealth ?? 0;
    expect(interceptor).toBeLessThan(fighter);
  });

  test("has no air-to-air damage of its own", () => {
    // Its only weapon is the interception itself; it cannot shoot back.
    expect(game.config().unitInfo(UnitType.Interceptor).damage).toBe(undefined);
  });
});

describe("Interceptor vs MIRV separation", () => {
  test("killing a MIRV in flight cancels every staged warhead", async () => {
    // The mechanic this unit exists for. MIRVExecution stages 350 warhead
    // executions and spawns them ~10 ticks before separation; it also aborts
    // and cancels them all if its own unit dies externally. An interception
    // before that point therefore removes the whole cluster, not one warhead.
    const g: Game = await setup(
      "half_land_half_ocean",
      { instantBuild: true },
      [
        new PlayerInfo("a", PlayerType.Human, null, "a_id"),
        new PlayerInfo("b", PlayerType.Human, null, "b_id"),
      ],
    );
    const a = g.player("a_id");
    const b = g.player("b_id");
    const tiles: number[] = [];
    for (let x = 0; x < g.width(); x++) {
      for (let y = 0; y < g.height(); y++) {
        const t = g.ref(x, y);
        if (g.isLand(t)) tiles.push(t);
      }
    }
    for (const t of tiles) b.conquer(t);

    const spot = tiles[3];
    const mirv = a.buildUnit(UnitType.MIRV, spot, {
      targetTile: spot,
      targetPlayer: b,
    });

    const base = b.buildUnit(UnitType.Airstrip, tiles[0], {});
    const jet = b.buildUnit(UnitType.Interceptor, spot, { patrolTile: spot });
    const exec = new InterceptorExecution(jet, base, spot);
    exec.init(g, 0);

    expect(mirv.isActive()).toBe(true);
    exec.tick(1);
    expect(mirv.isActive()).toBe(false);

    // No warheads were ever left behind in the world.
    expect(g.units(UnitType.MIRVWarhead).length).toBe(0);
  });
});
