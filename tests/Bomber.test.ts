import { PlayerInfo, PlayerType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { BOMB_AREA_TILES, BOMB_TROOP_KILL, BomberExecution, BOMBS_PER_SORTIE } from "@openfront/engine/execution/BomberExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let foe: Player;
let bystander: Player;

/** big_plains 200x200: me x<20, bystander 20..99, foe x>=100. */
async function setupGame() {
  game = await setup("big_plains", { instantBuild: true }, [
    new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    new PlayerInfo("by", PlayerType.Human, null, "by_id"),
  ]);
  while (game.inSpawnPhase()) game.executeNextTick();
  me = game.player("me_id");
  foe = game.player("foe_id");
  bystander = game.player("by_id");
  for (let x = 0; x < 200; x++) {
    for (let y = 0; y < 200; y++) {
      const t = game.ref(x, y);
      if (x < 20) me.conquer(t);
      else if (x < 100) bystander.conquer(t);
      else foe.conquer(t);
    }
  }
  foe.setTroops(100_000);
  bystander.setTroops(100_000);
}

function launch(from: number, target: number) {
  const base = me.buildUnit(UnitType.Airfield, game.ref(10, 100), {});
  const bomber = me.buildUnit(UnitType.Bomber, from, { targetTile: target });
  game.addExecution(new BomberExecution(bomber, base, target));
  return bomber;
}

describe("Bomber", () => {
  beforeEach(setupGame);

  test("a bomb run kills troops in the bombed area and draws explosions", () => {
    const target = game.ref(150, 100);
    launch(target, target);
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
    expect(foe.troops()).toBeLessThan(100_000);
    expect(impacts.length).toBeGreaterThan(0);
  });

  test("a bomb kills only the troops stationed in its area, not the army", () => {
    // The old rule took 3% of the whole army per bomb, forever.
    const target = game.ref(150, 100);
    launch(target, target);
    for (let i = 0; i < 30; i++) game.executeNextTick();
    const perBomb = (BOMB_AREA_TILES / foe.numTilesOwned()) * BOMB_TROOP_KILL;
    expect(perBomb).toBeLessThan(0.01);
    expect(foe.troops()).toBeGreaterThan(100_000 * (1 - 3 * perBomb));
  });

  test("a sortie carries limited bombs, then the bomber flies home", () => {
    const target = game.ref(150, 100);
    const bomber = launch(target, target);
    for (let i = 0; i < 400; i++) game.executeNextTick();
    const afterSortie = foe.troops();
    for (let i = 0; i < 400; i++) game.executeNextTick();
    // No more bombs fall once the load is spent.
    expect(foe.troops()).toBe(afterSortie);
    expect(game.x(bomber.tile())).toBeLessThan(20);
    expect(BOMBS_PER_SORTIE).toBeGreaterThan(0);
  });

  test("it never bombs nations it overflies on the way to its target", () => {
    // Launched over the bystander, headed for the foe.
    launch(game.ref(25, 100), game.ref(150, 100));
    for (let i = 0; i < 200; i++) game.executeNextTick();
    expect(bystander.troops()).toBe(100_000);
    expect(foe.troops()).toBeLessThan(100_000);
  });
});
