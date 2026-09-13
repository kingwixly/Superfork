import { WarshipInterceptExecution } from "../src/core/execution/WarshipInterceptExecution";
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
let foe: Player;
let water: number;

function warshipAt(tile: number) {
  const ship = me.buildUnit(UnitType.Warship, tile, { patrolTile: tile });
  const exec = new WarshipInterceptExecution(ship);
  exec.init(game, 0);
  return { ship, exec };
}

describe("Warship nuke interception", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    foe = game.player("foe_id");
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

  test("shoots down a hostile atom bomb in its radius", () => {
    const { exec } = warshipAt(water);
    const nuke = foe.buildUnit(UnitType.AtomBomb, water, {
      targetTile: water,
      trajectory: [],
    });

    exec.tick(1000);

    expect(nuke.isActive()).toBe(false);
  });

  test("prefers an unseparated MIRV over a closer atom bomb", () => {
    const { exec } = warshipAt(water);
    const atom = foe.buildUnit(UnitType.AtomBomb, water, {
      targetTile: water,
      trajectory: [],
    });
    const mirv = foe.buildUnit(UnitType.MIRV, water, {
      targetTile: water,
      targetPlayer: me,
    });

    exec.tick(1000);

    expect(mirv.isActive()).toBe(false);
    expect(atom.isActive()).toBe(true);
  });

  test("ignores friendly warheads", () => {
    const { exec } = warshipAt(water);
    const mine = me.buildUnit(UnitType.AtomBomb, water, {
      targetTile: water,
      trajectory: [],
    });

    exec.tick(1000);

    expect(mine.isActive()).toBe(true);
  });

  test("respects the SAM cooldown between intercepts", () => {
    const { exec } = warshipAt(water);
    const a = foe.buildUnit(UnitType.AtomBomb, water, {
      targetTile: water,
      trajectory: [],
    });
    const b = foe.buildUnit(UnitType.AtomBomb, water, {
      targetTile: water,
      trajectory: [],
    });

    exec.tick(1000);
    exec.tick(1001); // well inside the cooldown

    const killed = [a, b].filter((u) => !u.isActive()).length;
    expect(killed).toBe(1);
  });

  test("stops when the warship dies", () => {
    const { ship, exec } = warshipAt(water);
    ship.delete(false);
    exec.tick(1000);
    expect(exec.isActive()).toBe(false);
  });

  test("the reworked warship outclasses the destroyer it replaced", () => {
    const w = game.config().unitInfo(UnitType.Warship);
    const d = game.config().unitInfo(UnitType.Destroyer);
    expect(w.maxHealth).toBeGreaterThan(d.maxHealth ?? 0);
    expect(w.cost(game, me)).toBeGreaterThan(d.cost(game, me));
  });
});
