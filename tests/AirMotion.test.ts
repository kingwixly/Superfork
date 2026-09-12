import {
  airDistanceTiles,
  airPositionOf,
  POS_SCALE,
  stepToward,
  tileOfAirPosition,
} from "../src/core/execution/utils/AirMotion";
import { Game, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;

describe("Air motion", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("a", PlayerType.Human, null, "a_id"),
    ]);
  });

  test("tile <-> position round-trips", () => {
    const t = game.ref(3, 3);
    expect(tileOfAirPosition(game, airPositionOf(game, t))).toBe(t);
  });

  test("a flight reaches its target and stops there", () => {
    const pos = airPositionOf(game, game.ref(2, 2));
    const target = airPositionOf(
      game,
      game.ref(game.width() - 2, game.height() - 2),
    );
    let arrived = false;
    for (let i = 0; i < 500 && !arrived; i++) {
      arrived = stepToward(pos, target, 2);
    }
    expect(arrived).toBe(true);
    expect(pos).toEqual(target);
  });

  test("aircraft ignore terrain — a path may cross water and land alike", () => {
    // No terrain is consulted at all; this pins that behaviour so a future
    // change that adds terrain cost to air movement fails loudly.
    const pos = airPositionOf(game, game.ref(1, 1));
    const target = airPositionOf(game, game.ref(game.width() - 2, 1));
    let steps = 0;
    while (!stepToward(pos, target, 3) && steps < 1000) steps++;
    expect(tileOfAirPosition(game, pos)).toBe(game.ref(game.width() - 2, 1));
  });

  test("movement is integer-only and bit-identical when repeated", () => {
    // The determinism guarantee: same inputs, same outputs, every client.
    const run = () => {
      const p = airPositionOf(game, game.ref(1, game.height() - 2));
      const t = airPositionOf(game, game.ref(game.width() - 2, 1));
      const trace: number[] = [];
      for (let i = 0; i < 40; i++) {
        stepToward(p, t, 1.7);
        trace.push(p.x, p.y);
      }
      return trace;
    };
    const first = run();
    expect(run()).toEqual(first);
    // Every intermediate value is a whole number — no float drift to accumulate.
    expect(first.every((v) => Number.isInteger(v))).toBe(true);
  });

  test("speed below one sub-tile per tick still makes progress", () => {
    // Guards against a slow unit stalling forever on integer truncation.
    const p = airPositionOf(game, game.ref(0, 0));
    const t = airPositionOf(game, game.ref(game.width() - 1, 0));
    const before = p.x;
    stepToward(p, t, 0.001);
    expect(p.x).toBeGreaterThan(before);
  });

  test("distance is measured in whole tiles", () => {
    const a = airPositionOf(game, game.ref(2, 2));
    const b = airPositionOf(game, game.ref(8, 2));
    expect(airDistanceTiles(a, b)).toBe(6);
    expect(POS_SCALE).toBeGreaterThan(1);
  });
});
