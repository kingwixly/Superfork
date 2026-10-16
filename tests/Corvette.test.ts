import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { CORVETTE_LANDING_RANGE } from "@openfront/engine-lib/configuration/SuperforkUnits";
import {
  CorvetteExecution,
  LaunchCorvetteExecution,
  LoadCorvetteExecution,
} from "@openfront/engine/execution/CorvetteExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let ally: Player;
let foe: Player;
let water: number;
let land: number[];

function corvetteAt(owner: Player, tile: number) {
  return owner.buildUnit(UnitType.Corvette, tile, { patrolTile: tile });
}

describe("Corvette", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("ally", PlayerType.Human, null, "ally_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    ally = game.player("ally_id");
    foe = game.player("foe_id");
    me.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;

    land = [];
    water = -1;
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
        else if (water < 0 && game.isWater(t)) water = t;
      }
    }
    for (const t of land) me.conquer(t);
  });

  test("the owner can load troops onto it", () => {
    const c = corvetteAt(me, water);
    const before = me.troops();
    const moved = CorvetteExecution.load(game, c, me, 500);
    expect(moved).toBe(500);
    expect(c.troops()).toBe(500);
    expect(me.troops()).toBe(before - 500);
  });

  test("an ally can load troops onto it", () => {
    const req = me.createAllianceRequest(ally);
    req?.accept();
    expect(me.isFriendly(ally)).toBe(true);
    const c = corvetteAt(me, water);
    expect(CorvetteExecution.canLoad(c, ally)).toBe(true);
  });

  test("an enemy cannot", () => {
    const c = corvetteAt(me, water);
    expect(CorvetteExecution.canLoad(c, foe)).toBe(false);
  });

  test("capacity is bounded — it cannot absorb an army", () => {
    const c = corvetteAt(me, water);
    const moved = CorvetteExecution.load(game, c, me, 10_000_000);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(me.troops() + moved);
  });

  test("it deploys even when a port is closer — the old rule is gone", () => {
    // Put a port right on the target; the corvette is far away.
    let shore = -1;
    for (const t of land) {
      if (game.isShore(t)) {
        shore = t;
        break;
      }
    }
    // The closest-staging rule was written when a corvette delivered troops
    // in one shot, to stop it being a strictly better boat. But vanilla
    // transport boats already have unlimited range, so it only ever blocked
    // the common case and made corvettes useless. With a reserve the real
    // constraint is that loaded troops sit exposed at sea until you land them.
    me.buildUnit(UnitType.Port, shore, {});
    const c = corvetteAt(me, water);
    CorvetteExecution.load(game, c, me, 300);
    expect(CorvetteExecution.deploy(game, c, shore)).toBe(true);
    expect(c.troops()).toBe(0);
  });

  test("it deploys when it is the closest staging point", () => {
    const c = corvetteAt(me, water);
    CorvetteExecution.load(game, c, me, 300);
    // No ports at all, so the corvette is trivially closest.
    expect(CorvetteExecution.deploy(game, c, land[0])).toBe(true);
    expect(c.troops()).toBe(0);
  });

  test("the hull survives the landing — it is a reusable platform", () => {
    const c = corvetteAt(me, water);
    CorvetteExecution.load(game, c, me, 300);
    CorvetteExecution.deploy(game, c, land[0]);
    expect(c.isActive()).toBe(true);
  });

  test("an empty corvette cannot deploy", () => {
    const c = corvetteAt(me, water);
    expect(CorvetteExecution.deploy(game, c, land[0])).toBe(false);
  });

  test("it is the weakest and cheapest combat hull", () => {
    const cv = game.config().unitInfo(UnitType.Corvette);
    const d = game.config().unitInfo(UnitType.Destroyer);
    const w = game.config().unitInfo(UnitType.Warship);
    expect(cv.maxHealth).toBeLessThan(d.maxHealth ?? 0);
    expect(cv.maxHealth).toBeLessThan(w.maxHealth ?? 0);
    expect(cv.cost(game, me)).toBeLessThan(d.cost(game, me));
  });

  // The orders a player's radial-menu click sends, run through the game the
  // way a turn does - the static helpers above were tested, this path wasn't.
  describe("orders (load_corvette / launch_corvette)", () => {
    function run(exec: LoadCorvetteExecution | LaunchCorvetteExecution) {
      game.addExecution(exec);
      game.executeNextTick();
      game.executeNextTick();
    }

    /** A water tile next to the shore and the land tile beside it. */
    function shorePair(): { sea: number; shore: number } {
      for (const t of land) {
        if (!game.isShore(t)) continue;
        for (const n of game.neighbors(t)) {
          if (game.isWater(n)) return { sea: n, shore: t };
        }
      }
      throw new Error("no shore on the test map");
    }

    test("loading by order moves troops onto the hull", () => {
      const { sea } = shorePair();
      const c = corvetteAt(me, sea);
      run(new LoadCorvetteExecution(me, c.id(), 400));
      expect(c.troops()).toBe(400);
    });

    test("landing by order on enemy land in range starts an attack", () => {
      const { sea, shore } = shorePair();
      foe.conquer(shore);
      const c = corvetteAt(me, sea);
      run(new LoadCorvetteExecution(me, c.id(), 400));
      const foeTiles = foe.numTilesOwned();
      run(new LaunchCorvetteExecution(me, c.id(), shore));
      expect(c.troops()).toBe(0);
      expect(c.isActive()).toBe(true);
      expect(game.owner(shore)).toBe(me);
      expect(foe.numTilesOwned()).toBeLessThan(foeTiles);
    });

    test("a landing order beyond the corvette's range is refused", () => {
      const { sea } = shorePair();
      const far = land.find(
        (t) => game.manhattanDist(t, sea) > CORVETTE_LANDING_RANGE + 5,
      )!;
      const c = corvetteAt(me, sea);
      run(new LoadCorvetteExecution(me, c.id(), 400));
      run(new LaunchCorvetteExecution(me, c.id(), far));
      expect(c.troops()).toBe(400);
    });

    test("an enemy's load order does nothing", () => {
      const { sea } = shorePair();
      const c = corvetteAt(me, sea);
      const before = foe.troops();
      run(new LoadCorvetteExecution(foe, c.id(), 400));
      expect(c.troops()).toBe(0);
      expect(foe.troops()).toBeGreaterThanOrEqual(before - 1);
    });
  });
});
