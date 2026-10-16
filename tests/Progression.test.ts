/**
 * Superfork progression in the engine: tree locks, governments and labs.
 */
import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import {
  GOVERNMENT_SWITCH_COOLDOWN,
  GOVERNMENT_TRANSITION_TICKS,
  GOVERNMENTS,
  Progression,
  RP_INTERVAL,
} from "@openfront/engine-api/game/Progression";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { SetGovernmentExecution } from "@openfront/engine/execution/LabExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;

async function start(
  progression: Progression | null,
  config: Record<string, unknown> = {},
) {
  game = await setup("big_plains", { instantBuild: true, ...config }, [
    new PlayerInfo(
      "me",
      PlayerType.Human,
      "me_client",
      "me_id",
      false,
      null,
      [],
      null,
      null,
      progression,
    ),
  ]);
  while (game.inSpawnPhase()) game.executeNextTick();
  me = game.player("me_id");
  for (let x = 0; x < 100; x++) {
    for (let y = 0; y < 200; y++) me.conquer(game.ref(x, y));
  }
  me.addGold(500_000_000n);
  game.config().structureMinDist = () => 1;
}

const run = (n: number) => {
  for (let i = 0; i < n; i++) game.executeNextTick();
};

describe("research tree locks", () => {
  test("base gear is open, tree gear is locked until unlocked", async () => {
    await start({ nodes: [], buffs: [] });
    const t = game.ref(50, 50);
    expect(me.canBuild(UnitType.City, t)).not.toBe(false);
    expect(me.canBuild(UnitType.Lab, t)).not.toBe(false);
    expect(me.canBuild(UnitType.Bank, t)).toBe(false);
    expect(me.canBuild(UnitType.Airfield, t)).toBe(false);
  });

  test("an unlocked node opens its gear", async () => {
    await start({ nodes: ["bank", "airfield"], buffs: [] });
    const t = game.ref(50, 50);
    expect(me.canBuild(UnitType.Bank, t)).not.toBe(false);
    expect(me.canBuild(UnitType.Airfield, t)).not.toBe(false);
  });

  test("admins bypass, and an unlock-everything lobby opens it all", async () => {
    await start({ nodes: [], buffs: [], bypass: true });
    expect(me.canBuild(UnitType.Bank, game.ref(50, 50))).not.toBe(false);
    await start({ nodes: [], buffs: [] }, { unlockAll: true });
    expect(me.canBuild(UnitType.Bank, game.ref(50, 50))).not.toBe(false);
  });
});

describe("governments", () => {
  test("only unlocked governments can be chosen", async () => {
    await start({ nodes: [], buffs: [] });
    new SetGovernmentExecution(me, "democracy").init(game, game.ticks());
    expect(me.government()).toBe("standard");
    await start({ nodes: ["gov_democracy"], buffs: [] });
    new SetGovernmentExecution(me, "democracy").init(game, game.ticks());
    expect(me.government()).toBe("democracy");
  });

  test("a change waits out a transition and then a cooldown", async () => {
    await start({ nodes: ["gov_democracy", "gov_monarchy"], buffs: [] });
    run(700); // past the free opening pick
    const gold0 = game.config().goldAdditionRate(me);
    new SetGovernmentExecution(me, "democracy").init(game, game.ticks());
    expect(me.government()).toBe("democracy");
    // Not yet in effect.
    expect(game.config().goldAdditionRate(me)).toBe(gold0);
    run(GOVERNMENT_TRANSITION_TICKS + 1);
    expect(Number(game.config().goldAdditionRate(me))).toBeCloseTo(
      Number(gold0) * GOVERNMENTS.democracy.effects.gold,
      -1,
    );
    // Cooldown: no second switch yet.
    new SetGovernmentExecution(me, "monarchy").init(game, game.ticks());
    expect(me.government()).toBe("democracy");
    run(GOVERNMENT_SWITCH_COOLDOWN);
    new SetGovernmentExecution(me, "monarchy").init(game, game.ticks());
    expect(me.government()).toBe("monarchy");
  });

  test("the starting government applies from the first tick", async () => {
    await start({ nodes: ["gov_junta"], buffs: [], government: "junta" });
    expect(me.government()).toBe("junta");
    expect(me.effects().attackSpeed).toBeCloseTo(1.2);
  });

  test("research buffs stack on top", async () => {
    await start({ nodes: [], buffs: [5] });
    expect(me.effects().gold).toBeCloseTo(1.15);
  });
});

describe("labs", () => {
  test("a lab makes research points, counted in the stats", async () => {
    await start({ nodes: [], buffs: [] });
    game.addExecution(
      new ConstructionExecution(me, UnitType.Lab, game.ref(50, 50)),
    );
    run(RP_INTERVAL * 3 + 5);
    expect(me.units(UnitType.Lab).length).toBe(1);
    expect(me.researchPoints()).toBeGreaterThanOrEqual(2);
    const stats = game.stats().stats()["me_client"];
    expect(stats?.researchPoints).toBe(me.researchPoints());
  });
});
