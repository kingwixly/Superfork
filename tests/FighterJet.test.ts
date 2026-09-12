import { FighterJetExecution } from "../src/core/execution/FighterJetExecution";
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

function launch(owner: Player, at: number, home: number, patrol: number) {
  const base = owner.buildUnit(UnitType.Airstrip, home, {});
  const jet = owner.buildUnit(UnitType.FighterJet, at, { patrolTile: patrol });
  const exec = new FighterJetExecution(jet, base, patrol);
  exec.init(game, 0);
  return { jet, base, exec };
}

describe("Fighter jet", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    foe = game.player("foe_id");
    me.addGold(100_000_000n);
    foe.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) me.conquer(t);
      }
    }
  });

  test("captures an enemy airliner rather than destroying it", () => {
    const spot = game.ref(4, 4);
    const { exec } = launch(me, spot, game.ref(3, 3), spot);
    const airliner = foe.buildUnit(UnitType.Airliner, spot, {
      targetUnit: undefined as never,
    });

    exec.tick(1);

    expect(airliner.isActive()).toBe(true);
    expect(airliner.owner()).toBe(me);
  });

  test("captures cargo jets too", () => {
    const spot = game.ref(5, 5);
    const { exec } = launch(me, spot, game.ref(3, 3), spot);
    const cargo = foe.buildUnit(UnitType.CargoJet, spot, {
      targetUnit: undefined as never,
    });

    exec.tick(1);

    expect(cargo.isActive()).toBe(true);
    expect(cargo.owner()).toBe(me);
  });

  test("shoots down an enemy fighter instead of capturing it", () => {
    const spot = game.ref(6, 6);
    const { exec } = launch(me, spot, game.ref(3, 3), spot);
    const enemy = foe.buildUnit(UnitType.FighterJet, spot, {
      patrolTile: spot,
    });
    const before = enemy.health();

    exec.tick(1);

    expect(enemy.owner()).toBe(foe); // never captured
    expect(enemy.health()).toBeLessThan(before);
  });

  test("an interceptor dies fast to a fighter — the air-defence trade-off", () => {
    const spot = game.ref(7, 7);
    const { exec } = launch(me, spot, game.ref(3, 3), spot);
    const interceptor = foe.buildUnit(UnitType.Interceptor, spot, {
      patrolTile: spot,
    });

    // Interceptor health is deliberately below a couple of AA hits.
    for (let i = 0; i < 3 && interceptor.isActive(); i++) exec.tick(i);

    expect(interceptor.isActive()).toBe(false);
  });

  test("ignores friendly aircraft", () => {
    const spot = game.ref(8, 8);
    const { exec } = launch(me, spot, game.ref(3, 3), spot);
    const friend = me.buildUnit(UnitType.Airliner, spot, {
      targetUnit: undefined as never,
    });

    exec.tick(1);

    expect(friend.owner()).toBe(me);
    expect(friend.isActive()).toBe(true);
  });

  test("is shot down if it is caught in sanctioned airspace", () => {
    // Find a land tile and hand it to foe, who then closes their sky to me.
    let spot = -1;
    for (let x = 0; x < game.width() && spot < 0; x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) {
          spot = t;
          break;
        }
      }
    }
    expect(spot).toBeGreaterThanOrEqual(0);
    foe.conquer(spot);
    foe.addSanction(me);
    const { jet, exec } = launch(me, spot, game.ref(3, 3), spot);

    exec.tick(1);

    expect(jet.isActive()).toBe(false);
  });
});
