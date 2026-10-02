import {
  BOMB_TROOP_KILL,
  BomberExecution,
} from "../src/core/execution/BomberExecution";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { setup } from "./util/Setup";

describe("Bomber", () => {
  test("a bomb run kills troops and leaves explosions to draw", async () => {
    const game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    while (game.inSpawnPhase()) game.executeNextTick();
    const me = game.player("me_id");
    const foe = game.player("foe_id");
    const land: number[] = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    for (const t of land) foe.conquer(t);
    foe.setTroops(100_000);

    const target = land[Math.floor(land.length / 2)];
    const bomber = me.buildUnit(UnitType.Bomber, target, {
      targetTile: target,
    });
    game.addExecution(new BomberExecution(bomber, undefined, target));

    const impacts: number[] = [];
    for (let i = 0; i < 60; i++) {
      const u = game.executeNextTick();
      for (const up of u[GameUpdateType.Unit] ?? []) {
        if (
          up.unitType === UnitType.Shell &&
          !up.isActive &&
          up.reachedTarget
        ) {
          impacts.push(up.pos);
        }
      }
    }
    expect(foe.troops()).toBeLessThanOrEqual(100_000 * (1 - BOMB_TROOP_KILL));
    // Bomb runs used to have no visual at all.
    expect(impacts.length).toBeGreaterThan(0);
  });
});
