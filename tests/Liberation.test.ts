import {
  CeasefireProposeExecution,
  CeasefireResponseExecution,
  clearPendingCeasefires,
  liberate,
} from "../src/core/execution/CeasefireExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let victim: Player;
let aggressor: Player;
let mediator: Player;
let land: number[];

describe("Liberation", () => {
  beforeEach(async () => {
    clearPendingCeasefires();
    game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("victim", PlayerType.Human, null, "v_id"),
      new PlayerInfo("aggressor", PlayerType.Human, null, "a_id"),
      new PlayerInfo("mediator", PlayerType.Human, null, "m_id"),
    ]);
    victim = game.player("v_id");
    aggressor = game.player("a_id");
    mediator = game.player("m_id");
    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
  });

  /** Victim holds the first `n` tiles; aggressor then takes `taken` of them. */
  function invade(n: number, taken: number) {
    for (const t of land.slice(0, n)) victim.conquer(t);
    for (const t of land.slice(0, taken)) aggressor.conquer(t);
  }

  test("the ledger records only player-to-player transfers", () => {
    for (const t of land.slice(0, 5)) victim.conquer(t);
    // Neutral -> player is expansion, not conquest.
    expect(game.conquestLedger().size()).toBe(0);

    aggressor.conquer(land[0]);
    expect(game.conquestLedger().size()).toBe(1);
  });

  test("liberation restores exactly the tiles that were taken", () => {
    invade(10, 4);
    expect(aggressor.numTilesOwned()).toBe(4);

    const restored = liberate(game, victim.id(), aggressor, mediator);

    expect(restored).toBe(4);
    expect(aggressor.numTilesOwned()).toBe(0);
    expect(victim.numTilesOwned()).toBe(10);
  });

  test("it does not touch land the aggressor always held", () => {
    for (const t of land.slice(0, 5)) victim.conquer(t);
    for (const t of land.slice(20, 25)) aggressor.conquer(t); // own expansion
    aggressor.conquer(land[0]); // one tile taken from the victim

    const restored = liberate(game, victim.id(), aggressor, mediator);

    expect(restored).toBe(1);
    expect(aggressor.numTilesOwned()).toBe(5);
  });

  test("it does not hand back ground the aggressor already lost", () => {
    invade(10, 4);
    // Mediator takes two of those tiles off the aggressor first.
    mediator.conquer(land[0]);
    mediator.conquer(land[1]);

    const restored = liberate(game, victim.id(), aggressor, mediator);

    expect(restored).toBe(2);
    expect(game.owner(land[0])).toBe(mediator);
  });

  test("the ledger stays bounded when tiles change hands repeatedly", () => {
    for (const t of land.slice(0, 6)) victim.conquer(t);
    for (let i = 0; i < 20; i++) {
      for (const t of land.slice(0, 6)) {
        (i % 2 === 0 ? aggressor : victim).conquer(t);
      }
    }
    // Each tile lives in exactly one bucket, however often it moves.
    expect(game.conquestLedger().size()).toBe(6);
  });

  test("liberation revives a conquered nation", () => {
    invade(6, 6);
    expect(victim.numTilesOwned()).toBe(0);

    liberate(game, victim.id(), aggressor, mediator);

    expect(victim.numTilesOwned()).toBe(6);
  });

  test("the mediator allies the victim it freed", () => {
    invade(8, 3);
    liberate(game, victim.id(), aggressor, mediator);
    expect(mediator.isFriendly(victim)).toBe(true);
  });

  test("accepting a ceasefire carrying the condition performs the liberation", () => {
    invade(10, 5);

    // Mediator proposes to the aggressor, conditioned on freeing the victim.
    const propose = new CeasefireProposeExecution(
      mediator,
      aggressor.id(),
      victim.id(),
    );
    propose.init(game, game.ticks());

    const respond = new CeasefireResponseExecution(
      aggressor,
      mediator.id(),
      true,
    );
    respond.init(game, game.ticks());

    // Truce and territory are atomic — both happened.
    expect(aggressor.hasCeasefireWith(mediator)).toBe(true);
    expect(victim.numTilesOwned()).toBe(10);
  });

  test("declining that ceasefire liberates nothing", () => {
    invade(10, 5);
    const propose = new CeasefireProposeExecution(
      mediator,
      aggressor.id(),
      victim.id(),
    );
    propose.init(game, game.ticks());
    const respond = new CeasefireResponseExecution(
      aggressor,
      mediator.id(),
      false,
    );
    respond.init(game, game.ticks());

    expect(victim.numTilesOwned()).toBe(5);
  });

  test("an unknown victim is a no-op", () => {
    invade(10, 4);
    expect(liberate(game, "nobody", aggressor, mediator)).toBe(0);
  });
});
