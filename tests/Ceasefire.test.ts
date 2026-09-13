import {
  CEASEFIRE_DURATION_TICKS,
  CeasefireProposeExecution,
  CeasefireResponseExecution,
  clearPendingCeasefires,
  pendingCeasefireBetween,
} from "../src/core/execution/CeasefireExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let a: Player;
let b: Player;

function propose(liberationFor?: string) {
  const e = new CeasefireProposeExecution(a, b.id(), liberationFor);
  e.init(game, game.ticks());
}
function respond(accept: boolean) {
  const e = new CeasefireResponseExecution(b, a.id(), accept);
  e.init(game, game.ticks());
}

describe("Ceasefire", () => {
  beforeEach(async () => {
    clearPendingCeasefires();
    game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("a", PlayerType.Human, null, "a_id"),
      new PlayerInfo("b", PlayerType.Human, null, "b_id"),
    ]);
    a = game.player("a_id");
    b = game.player("b_id");
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) {
          (game.ref(x, y) % 2 === 0 ? a : b).conquer(t);
        }
      }
    }
  });

  test("both sides can attack before any ceasefire", () => {
    expect(a.canAttackPlayer(b)).toBe(true);
    expect(b.canAttackPlayer(a)).toBe(true);
  });

  test("a proposal alone does nothing until accepted", () => {
    propose();
    expect(pendingCeasefireBetween(a, b)).toBeDefined();
    expect(a.canAttackPlayer(b)).toBe(true);
  });

  test("accepting suppresses land attacks both ways", () => {
    propose();
    respond(true);
    expect(a.canAttackPlayer(b)).toBe(false);
    expect(b.canAttackPlayer(a)).toBe(false);
  });

  test("declining leaves the war running", () => {
    propose();
    respond(false);
    expect(a.canAttackPlayer(b)).toBe(true);
    expect(pendingCeasefireBetween(a, b)).toBeUndefined();
  });

  test("it lasts two minutes and then lapses on its own", () => {
    propose();
    respond(true);
    expect(a.hasCeasefireWith(b)).toBe(true);

    // Advance past the expiry.
    for (let i = 0; i <= CEASEFIRE_DURATION_TICKS; i++) game.executeNextTick();

    expect(a.hasCeasefireWith(b)).toBe(false);
    expect(a.canAttackPlayer(b)).toBe(true);
  });

  test("attacking the moment it lapses carries no betrayal penalty", () => {
    // This is what separates it from an alliance: no traitor state, ever.
    propose();
    respond(true);
    for (let i = 0; i <= CEASEFIRE_DURATION_TICKS; i++) game.executeNextTick();
    expect(a.isTraitor()).toBe(false);
    expect(b.isTraitor()).toBe(false);
  });

  test("a ceasefire is not an alliance", () => {
    propose();
    respond(true);
    expect(a.isFriendly(b)).toBe(false);
    expect(a.allianceWith(b)).toBeNull();
  });

  test("responding with no outstanding offer does nothing", () => {
    respond(true);
    expect(a.canAttackPlayer(b)).toBe(true);
  });

  test("a nation cannot propose to itself", () => {
    const e = new CeasefireProposeExecution(a, a.id(), undefined);
    e.init(game, 0);
    expect(pendingCeasefireBetween(a, a)).toBeUndefined();
  });

  test("the liberation condition rides with the proposal", () => {
    propose("b_id");
    expect(pendingCeasefireBetween(a, b)?.liberationFor).toBe("b_id");
  });
});
