import { CedeLandExecution } from "../src/core/execution/CedeLandExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let enemy: Player;
let ally: Player;
let dead: Player;
let land: number[];

function cede(to: Player, tiles: number[]) {
  const e = new CedeLandExecution(me, to.id(), tiles);
  e.init(game, 0);
}

describe("Cede land", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("enemy", PlayerType.Human, null, "en_id"),
      new PlayerInfo("ally", PlayerType.Human, null, "al_id"),
      new PlayerInfo("dead", PlayerType.Human, null, "dd_id"),
    ]);
    me = game.player("me_id");
    enemy = game.player("en_id");
    ally = game.player("al_id");
    dead = game.player("dd_id");

    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    for (const t of land.slice(0, 20)) me.conquer(t);
    for (const t of land.slice(20, 25)) enemy.conquer(t);
    for (const t of land.slice(25, 30)) ally.conquer(t);
    const req = me.createAllianceRequest(ally);
    req?.accept();
  });

  test("you may cede to a nation you are at war with", () => {
    expect(CedeLandExecution.canCedeTo(me, enemy)).toBe(true);
    cede(enemy, land.slice(0, 4));
    expect(enemy.numTilesOwned()).toBe(9);
    expect(me.numTilesOwned()).toBe(16);
  });

  test("you may not cede to an ally", () => {
    // Allies coordinate freely already; allowing this makes territory
    // fungible between them.
    expect(CedeLandExecution.canCedeTo(me, ally)).toBe(false);
    cede(ally, land.slice(0, 4));
    expect(ally.numTilesOwned()).toBe(5);
  });

  test("you may cede to a dead nation", () => {
    expect(dead.isAlive()).toBe(false);
    expect(CedeLandExecution.canCedeTo(me, dead)).toBe(true);
  });

  test("ceding to a dead nation revives it", () => {
    cede(dead, land.slice(0, 6));
    expect(dead.numTilesOwned()).toBe(6);
    expect(dead.isAlive()).toBe(true);
  });

  test("reviving a nation allies you to it", () => {
    cede(dead, land.slice(0, 6));
    expect(me.isFriendly(dead)).toBe(true);
  });

  test("ceding to a living enemy does not ally them", () => {
    cede(enemy, land.slice(0, 4));
    expect(me.isFriendly(enemy)).toBe(false);
  });

  test("tiles you do not own are skipped", () => {
    // The wire payload is not trusted; the map is the source of truth.
    cede(enemy, land.slice(20, 25));
    expect(enemy.numTilesOwned()).toBe(5);
    expect(me.numTilesOwned()).toBe(20);
  });

  test("you cannot cede to yourself", () => {
    expect(CedeLandExecution.canCedeTo(me, me)).toBe(false);
    cede(me, land.slice(0, 4));
    expect(me.numTilesOwned()).toBe(20);
  });

  test("an unknown recipient is a no-op", () => {
    const e = new CedeLandExecution(me, "nobody", land.slice(0, 4));
    expect(() => e.init(game, 0)).not.toThrow();
    expect(me.numTilesOwned()).toBe(20);
  });

  test("ceding nothing does not trigger the revival alliance", () => {
    cede(dead, land.slice(20, 25)); // none of these are mine
    expect(me.isFriendly(dead)).toBe(false);
  });
});

describe("Liberation via cede", () => {
  test("the server fills the tiles from the conquest ledger", async () => {
    const g: Game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("victim", PlayerType.Human, null, "v2"),
      new PlayerInfo("aggressor", PlayerType.Human, null, "a2"),
    ]);
    const victim = g.player("v2");
    const aggressor = g.player("a2");
    const tiles: number[] = [];
    for (let x = 0; x < g.width(); x++) {
      for (let y = 0; y < g.height(); y++) {
        const t = g.ref(x, y);
        if (g.isLand(t)) tiles.push(t);
      }
    }
    for (const t of tiles.slice(0, 12)) victim.conquer(t);
    for (const t of tiles.slice(0, 5)) aggressor.conquer(t);
    expect(victim.numTilesOwned()).toBe(7);

    // The client sends a placeholder tile and the liberate flag; the server
    // discards it and uses the ledger, because the client has no ledger.
    const exec = new CedeLandExecution(aggressor, victim.id(), [0], true);
    exec.init(g, 0);

    expect(victim.numTilesOwned()).toBe(12);
    expect(aggressor.numTilesOwned()).toBe(0);
  });

  test("without the flag, the given tiles are used verbatim", async () => {
    const g: Game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("a", PlayerType.Human, null, "a3"),
      new PlayerInfo("b", PlayerType.Human, null, "b3"),
    ]);
    const a = g.player("a3");
    const b = g.player("b3");
    const tiles: number[] = [];
    for (let x = 0; x < g.width(); x++) {
      for (let y = 0; y < g.height(); y++) {
        const t = g.ref(x, y);
        if (g.isLand(t)) tiles.push(t);
      }
    }
    for (const t of tiles.slice(0, 10)) a.conquer(t);

    new CedeLandExecution(a, b.id(), tiles.slice(0, 3), false).init(g, 0);
    expect(b.numTilesOwned()).toBe(3);
  });
});
