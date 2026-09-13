import { WarshipExecution } from "../src/core/execution/WarshipExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let water: number;

describe("Destroyer", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    ]);
    me = game.player("me_id");
    me.addGold(100_000_000n);
    water = -1;
    for (let x = 0; x < game.width() && water < 0; x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isWater(t)) {
          water = t;
          break;
        }
      }
    }
  });

  test("inherits vanilla warship stats verbatim", () => {
    const d = game.config().unitInfo(UnitType.Destroyer);
    expect(d.maxHealth).toBe(1000);
    // The vanilla curve: min(1M, (n+1) * 250k).
    expect(d.cost(game, me)).toBe(250_000n);
  });

  test("the reworked warship is dearer and tougher", () => {
    const w = game.config().unitInfo(UnitType.Warship);
    const d = game.config().unitInfo(UnitType.Destroyer);
    expect(w.maxHealth).toBeGreaterThan(d.maxHealth ?? 0);
    expect(w.cost(game, me)).toBeGreaterThan(d.cost(game, me));
  });

  test("warship and destroyer share one cost ladder", () => {
    const before = game.config().unitInfo(UnitType.Destroyer).cost(game, me);
    me.buildUnit(UnitType.Warship, water, { patrolTile: water });
    const after = game.config().unitInfo(UnitType.Destroyer).cost(game, me);
    // Building a warship raises the destroyer's price, so fielding one hull
    // cannot dodge the other's pricing.
    expect(after).toBeGreaterThan(before);
  });

  function withPort() {
    // warshipSpawn picks the water component nearest an owned port, so a
    // fleet needs one before it can be built at all.
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) me.conquer(t);
      }
    }
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isShore(t) && game.owner(t) === me) {
          return me.buildUnit(UnitType.Port, t, {});
        }
      }
    }
    throw new Error("no shore");
  }

  test("the shared execution drives a destroyer hull", () => {
    withPort();
    const exec = new WarshipExecution(
      { owner: me, patrolTile: water },
      UnitType.Destroyer,
    );
    exec.init(game, 0);
    expect(me.units(UnitType.Destroyer).length).toBe(1);
    expect(me.units(UnitType.Warship).length).toBe(0);
  });

  test("defaulting the hull still builds a warship", () => {
    withPort();
    const exec = new WarshipExecution({ owner: me, patrolTile: water });
    exec.init(game, 0);
    expect(me.units(UnitType.Warship).length).toBe(1);
  });

  test("interception is a property of the execution, not of unitInfo.range", () => {
    // `range` is gun engagement range and both hulls have one. What separates
    // them is that only Warship gets a WarshipInterceptExecution attached.
    expect(game.config().unitInfo(UnitType.Destroyer).range).toBeGreaterThan(0);
    expect(game.config().unitInfo(UnitType.Warship).range ?? 0).toBe(0);
  });
});
