/**
 * Superfork provinces: drawing and editing (part 1), and the rules on top:
 * bonuses, the capital rule, liberation, tribe integration, province attacks,
 * breakaways and capital collapse.
 */
import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import {
  INTEGRATION_ODDS,
  ProvinceExecution,
  tryIntegrateTribe,
} from "@openfront/engine/execution/ProvinceExecution";
import {
  ProvinceRulesExecution,
  setBreakawayChanceForTests,
} from "@openfront/engine/execution/ProvinceRulesExecution";
import { Game, Player } from "@openfront/engine/game/Game";
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
  const e = new ProvinceExecution(who, intent as never);
  e.init(game, game.ticks());
  e.tick(game.ticks());
}

/** Vertical cuts at the given columns, top to bottom. */
function cuts(...xs: number[]) {
  const points: number[] = [];
  const breaks: number[] = [];
  for (const x of xs) {
    if (points.length > 0) breaks.push(points.length);
    points.push(game.ref(x, 0), game.ref(x, H - 1));
  }
  return { points, breaks };
}

async function start(map = "big_plains") {
  game = await setup(map, { instantBuild: true, provinces: true }, [
    new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
  ]);
  me = game.player("me_id");
  foe = game.player("foe_id");
  W = game.width();
  H = game.height();
  for (const t of column(0, W - 10)) me.conquer(t);
  for (const t of column(W - 10, W)) foe.conquer(t);
}

describe("Provinces: drawing and editing", () => {
  beforeEach(() => start("plains"));

  test("a drawn line splits federal land; the larger side stays federal", () => {
    act({ action: "draw", ...cuts(Math.floor(W * 0.6)) });
    const mine = game.provinces().ownedBy(me);
    expect(mine.length).toBe(1);
    const p = mine[0];
    expect(game.x(p.tiles[0])).toBeGreaterThanOrEqual(Math.floor(W * 0.6) - 1);
    expect(p.contested()).toBe(false);
  });

  test("areas below the minimum size stay federal", () => {
    act({ action: "draw", ...cuts(W - 12) });
    expect(game.provinces().ownedBy(me).length).toBe(0);
  });

  test("nothing happens unless the lobby enabled provinces", async () => {
    game = await setup("plains", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    ]);
    me = game.player("me_id");
    for (const t of column(0, W)) me.conquer(t);
    act({ action: "draw", ...cuts(Math.floor(W / 2)) });
    expect(game.provinces().all().length).toBe(0);
    expect(me.provinceCount()).toBe(0);
  });

  test("losing part of a province makes it contested; losing all of it hands it over", () => {
    act({ action: "draw", ...cuts(Math.floor(W * 0.6)) });
    const p = game.provinces().ownedBy(me)[0];
    const tiles = [...p.tiles];
    foe.conquer(tiles[0]);
    expect(p.contested()).toBe(true);
    expect(p.owner).toBe(me);
    for (const t of tiles) foe.conquer(t);
    expect(p.owner).toBe(foe);
    expect(p.founder).toBe(me);
  });

  test("trim drops tiles the owner no longer holds", () => {
    act({ action: "draw", ...cuts(Math.floor(W * 0.6)) });
    const p = game.provinces().ownedBy(me)[0];
    const before = p.size();
    foe.conquer(p.tiles[0]);
    act({ action: "trim", provinceId: p.id });
    expect(p.size()).toBe(before - 1);
    expect(p.contested()).toBe(false);
  });

  test("rename, administrative, merge and disband", () => {
    act({ action: "draw", ...cuts(Math.floor(W * 0.4), Math.floor(W * 0.7)) });
    const mine = game.provinces().ownedBy(me);
    expect(mine.length).toBe(2);
    const [a, b] = mine;
    act({ action: "rename", provinceId: a.id, name: "Northmark" });
    expect(a.name).toBe("Northmark");
    act({ action: "rename", provinceId: a.id, name: "<script>" });
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
    act({ action: "draw", ...cuts(Math.floor(W * 0.6)) });
    const p = game.provinces().ownedBy(me)[0];
    act({ action: "disband", provinceId: p.id }, foe);
    expect(game.provinces().get(p.id)).toBeDefined();
  });

  test("clients receive province updates", () => {
    act({ action: "draw", ...cuts(Math.floor(W * 0.6)) });
    const u = game.executeNextTick();
    const ups = u[GameUpdateType.Province];
    expect(ups.length).toBe(1);
    expect(ups[0].tiles?.length).toBe(ups[0].size);
    expect(ups[0].founderID).toBe(me.smallID());
  });
});

describe("Provinces: rules", () => {
  beforeEach(() => start());
  afterEach(() => setBreakawayChanceForTests(0.01));

  /** Five provinces in columns; the left column (x < 33) stays federal. */
  function fiveProvinces() {
    act({ action: "draw", ...cuts(33, 66, 99, 132, 165) });
    expect(game.provinces().ownedBy(me).length).toBe(5);
  }

  test("each province adds 5% max troops; gold counts at most three", () => {
    const troops0 = game.config().maxTroops(me);
    const gold0 = game.config().goldAdditionRate(me);
    fiveProvinces();
    const troops5 = game.config().maxTroops(me);
    expect(troops5 / troops0).toBeCloseTo(1.25, 2);
    const gold5 = game.config().goldAdditionRate(me);
    expect(Number(gold5) / Number(gold0)).toBeCloseTo(1.15, 1);
  });

  test("the administrative province must hold the capital", () => {
    me.buildUnit(UnitType.Capital, game.ref(10, 100), {});
    fiveProvinces();
    const p = game.provinces().ownedBy(me)[0];
    act({ action: "admin", provinceId: p.id });
    expect(p.administrative).toBe(false);
  });

  test("liberating a province founds a nation on it", () => {
    fiveProvinces();
    const p = game.provinces().ownedBy(me)[2];
    const tiles = [...p.tiles];
    const name = p.name;
    act({ action: "liberate", provinceId: p.id });
    const freed = game.owner(tiles[0]);
    expect(freed.isPlayer()).toBe(true);
    expect(freed).not.toBe(me);
    if (!freed.isPlayer()) return;
    expect(freed.displayName()).toBe(name);
    expect(freed.type()).toBe(PlayerType.Nation);
    expect(game.provinces().get(p.id)).toBeUndefined();
    expect(freed.isAlive()).toBe(true);
  });

  test("liberating a province you conquered improves relations with its founder", () => {
    fiveProvinces();
    const p = game.provinces().ownedBy(me)[4];
    for (const t of [...p.tiles]) foe.conquer(t);
    expect(p.owner).toBe(foe);
    const before = me.relation(foe);
    act({ action: "liberate", provinceId: p.id }, foe);
    expect(me.relation(foe)).toBeGreaterThan(before);
  });

  test("a tribe joins one time in six and becomes a province", async () => {
    const tribe = game.addPlayer(
      new PlayerInfo("Tribe", PlayerType.Bot, null, "tribe_id"),
    );
    // A 30x30 patch inside my land.
    const patch: number[] = [];
    for (let x = 40; x < 70; x++) {
      for (let y = 40; y < 70; y++) patch.push(game.ref(x, y));
    }
    for (const t of patch) tribe.conquer(t);
    let joined = false;
    for (let i = 0; i < INTEGRATION_ODDS * 10 && !joined; i++) {
      joined = tryIntegrateTribe(game, me, tribe);
      game.executeNextTick();
    }
    expect(joined).toBe(true);
    expect(tribe.numTilesOwned()).toBe(0);
    const p = game.provinces().provinceAt(patch[0]);
    expect(p?.owner).toBe(me);
    expect(p?.size()).toBe(patch.length);
  });

  test("a province attack only takes tiles of that province", () => {
    // Foe holds a province drawn in its own strip.
    for (const t of column(W - 60, W)) foe.conquer(t);
    act({ action: "draw", ...cuts(W - 30) }, foe);
    const p = game.provinces().ownedBy(foe)[0];
    expect(p).toBeDefined();
    // My land now borders foe's federal strip, not the province. Hand me a
    // foothold next to the province so the attack can reach it.
    const inside = game.provinces().provinceAt(game.ref(W - 25, 100))!;
    expect(inside).toBe(p);
    for (let x = W - 60; x < W - 29; x++) me.conquer(game.ref(x, 100));
    const attack = new AttackExecution(50_000, me, foe.id(), null);
    attack.restrictToProvince(p.id);
    game.addExecution(attack);
    const federalBefore = column(W - 60, W - 31).filter(
      (t) => game.owner(t) === foe,
    ).length;
    for (let i = 0; i < 60; i++) game.executeNextTick();
    expect(p.heldBy(me)).toBeGreaterThan(0);
    const federalAfter = column(W - 60, W - 31).filter(
      (t) => game.owner(t) === foe,
    ).length;
    expect(federalAfter).toBe(federalBefore);
  });

  test("an attack can set off a breakaway", () => {
    game.addExecution(new ProvinceRulesExecution());
    fiveProvinces();
    setBreakawayChanceForTests(1);
    const before = game.provinces().ownedBy(me).length;
    game.addExecution(new AttackExecution(10_000, foe, me.id(), null));
    for (let i = 0; i < 3; i++) game.executeNextTick();
    expect(game.provinces().ownedBy(me).length).toBeLessThan(before);
  });

  test("losing the capital with 5+ provinces hands the 3 smallest to the captor", () => {
    game.addExecution(new ProvinceRulesExecution());
    const capitalTile = game.ref(10, 100);
    me.buildUnit(UnitType.Capital, capitalTile, {});
    // Uneven sizes so "smallest" means something.
    act({ action: "draw", ...cuts(40, 80, 110, 140, 165) });
    const mine = game.provinces().ownedBy(me);
    expect(mine.length).toBe(5);
    const smallest = [...mine].sort((a, b) => a.size() - b.size()).slice(0, 3);
    // The rules start, then note where the capital stands.
    game.executeNextTick();
    game.executeNextTick();
    // Foe takes the capital.
    me.units(UnitType.Capital)[0].delete(false);
    foe.conquer(capitalTile);
    game.executeNextTick();
    game.executeNextTick();
    for (const p of smallest) expect(p.owner).toBe(foe);
    expect(game.provinces().ownedBy(me).length).toBe(2);
  });
});
