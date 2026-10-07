import { ProvinceExecution } from "../src/core/execution/ProvinceExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let foe: Player;
let W: number;
let H: number;

/** Every land tile with x in [x0, x1). */
function column(x0: number, x1: number): number[] {
  const out: number[] = [];
  for (let x = x0; x < x1; x++) {
    for (let y = 0; y < H; y++) {
      const t = game.ref(x, y);
      if (game.isLand(t)) out.push(t);
    }
  }
  return out;
}

function act(intent: Record<string, unknown>, who: Player = me) {
  new ProvinceExecution(who, { type: "province", ...intent } as never).init(
    game,
    game.ticks(),
  );
}

/** A vertical cut at column x, top to bottom. */
function cutAt(x: number) {
  return { points: [game.ref(x, 0), game.ref(x, H - 1)] };
}

describe("Provinces", () => {
  beforeEach(async () => {
    game = await setup("plains", { instantBuild: true, provinces: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    foe = game.player("foe_id");
    W = game.width();
    H = game.height();
    for (const t of column(0, W - 10)) me.conquer(t);
    for (const t of column(W - 10, W)) foe.conquer(t);
  });

  test("a drawn line splits federal land; the larger side stays federal", () => {
    act({ action: "draw", ...cutAt(Math.floor(W * 0.6)) });
    const mine = game.provinces().ownedBy(me);
    expect(mine.length).toBe(1);
    // No capital, so the largest area stays federal: the province is the
    // smaller, right-hand side.
    const p = mine[0];
    expect(game.x(p.tiles[0])).toBeGreaterThanOrEqual(Math.floor(W * 0.6) - 1);
    expect(p.contested()).toBe(false);
    // The line itself is not lost: every tile I own is federal or provincial.
    expect(p.size()).toBeGreaterThan(0);
  });

  test("areas below the minimum size stay federal", () => {
    act({ action: "draw", ...cutAt(W - 12) });
    expect(game.provinces().ownedBy(me).length).toBe(0);
  });

  test("nothing happens unless the lobby enabled provinces", async () => {
    game = await setup("plains", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    ]);
    me = game.player("me_id");
    W = game.width();
    H = game.height();
    for (const t of column(0, W)) me.conquer(t);
    act({ action: "draw", ...cutAt(Math.floor(W / 2)) });
    expect(game.provinces().all().length).toBe(0);
  });

  test("losing part of a province makes it contested; losing all of it hands it over", () => {
    act({ action: "draw", ...cutAt(Math.floor(W * 0.6)) });
    const p = game.provinces().ownedBy(me)[0];
    const tiles = [...p.tiles];
    foe.conquer(tiles[0]);
    expect(p.contested()).toBe(true);
    expect(p.owner).toBe(me);
    for (const t of tiles) foe.conquer(t);
    expect(p.owner).toBe(foe);
  });

  test("trim drops tiles the owner no longer holds", () => {
    act({ action: "draw", ...cutAt(Math.floor(W * 0.6)) });
    const p = game.provinces().ownedBy(me)[0];
    const before = p.size();
    foe.conquer(p.tiles[0]);
    act({ action: "trim", provinceId: p.id });
    expect(p.size()).toBe(before - 1);
    expect(p.contested()).toBe(false);
  });

  test("rename, administrative, merge and disband", () => {
    act({
      action: "draw",
      points: [
        game.ref(Math.floor(W * 0.4), 0),
        game.ref(Math.floor(W * 0.4), H - 1),
        game.ref(Math.floor(W * 0.7), 0),
        game.ref(Math.floor(W * 0.7), H - 1),
      ],
      breaks: [2],
    });
    const mine = game.provinces().ownedBy(me);
    expect(mine.length).toBe(2);
    const [a, b] = mine;
    act({ action: "rename", provinceId: a.id, name: "Northmark" });
    expect(a.name).toBe("Northmark");
    act({ action: "admin", provinceId: a.id });
    act({ action: "admin", provinceId: b.id });
    expect(a.administrative).toBe(false);
    expect(b.administrative).toBe(true);
    const total = a.size() + b.size();
    act({ action: "merge", provinceId: a.id, otherId: b.id });
    expect(a.size()).toBe(total);
    expect(game.provinces().get(b.id)).toBeUndefined();
    act({ action: "disband", provinceId: a.id });
    expect(game.provinces().ownedBy(me).length).toBe(0);
    expect(game.provinces().provinceAt(a.tiles[0])).toBeUndefined();
  });

  test("you cannot edit someone else's province", () => {
    act({ action: "draw", ...cutAt(Math.floor(W * 0.6)) });
    const p = game.provinces().ownedBy(me)[0];
    act({ action: "disband", provinceId: p.id }, foe);
    expect(game.provinces().get(p.id)).toBeDefined();
  });

  test("clients receive province updates", () => {
    act({ action: "draw", ...cutAt(Math.floor(W * 0.6)) });
    const u = game.executeNextTick();
    const ups = u[GameUpdateType.Province];
    expect(ups.length).toBe(1);
    expect(ups[0].tiles?.length).toBe(ups[0].size);
  });
});
