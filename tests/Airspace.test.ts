import {
  airspaceOwner,
  canFlyOver,
  pathCrossesRestrictedAirspace,
} from "../src/core/game/Airspace";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let a: Player;
let b: Player;

describe("Airspace", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("a", PlayerType.Human, null, "a_id"),
      new PlayerInfo("b", PlayerType.Human, null, "b_id"),
    ]);
    a = game.player("a_id");
    b = game.player("b_id");
  });

  function someLandOf(p: Player) {
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) {
          p.conquer(t);
          return t;
        }
      }
    }
    throw new Error("no land");
  }

  test("airspace follows territory ownership", () => {
    const t = someLandOf(a);
    expect(airspaceOwner(game, t)).toBe(a);
  });

  test("airspace is open by default — no sanction, anyone may overfly", () => {
    const t = someLandOf(a);
    expect(canFlyOver(game, b, t)).toBe(true);
  });

  test("unowned airspace is always open", () => {
    let unowned = -1;
    for (let x = 0; x < game.width() && unowned < 0; x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (!game.hasOwner(t)) {
          unowned = t;
          break;
        }
      }
    }
    expect(unowned).toBeGreaterThanOrEqual(0);
    expect(canFlyOver(game, a, unowned)).toBe(true);
  });

  test("a sanction closes the sanctioner's airspace to the target only", () => {
    const t = someLandOf(a);
    a.addSanction(b);
    expect(canFlyOver(game, b, t)).toBe(false);
    // The sanction is directional: a's own aircraft are unaffected.
    expect(canFlyOver(game, a, t)).toBe(true);
  });

  test("sanctions are directional — b sanctioning a does not close a's sky", () => {
    const t = someLandOf(a);
    b.addSanction(a);
    expect(canFlyOver(game, b, t)).toBe(true);
  });

  test("lifting a sanction reopens the airspace", () => {
    const t = someLandOf(a);
    a.addSanction(b);
    a.stopSanction(b);
    expect(canFlyOver(game, b, t)).toBe(true);
    expect(a.getSanctions().length).toBe(0);
  });

  test("a flight path through sanctioned territory is detected", () => {
    // Claim a band of land for `a`, then fly across it.
    const tiles: number[] = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) {
          a.conquer(t);
          tiles.push(t);
        }
      }
    }
    expect(tiles.length).toBeGreaterThan(20);
    const src = tiles[0];
    const dst = tiles[tiles.length - 1];

    expect(pathCrossesRestrictedAirspace(game, b, src, dst)).toBe(false);
    a.addSanction(b);
    expect(pathCrossesRestrictedAirspace(game, b, src, dst)).toBe(true);
  });
});
