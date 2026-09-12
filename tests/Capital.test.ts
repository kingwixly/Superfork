import { CAPITAL_TROOP_CAP_BONUS } from "../src/core/configuration/SuperforkUnits";
import {
  canDemoteCapital,
  DemoteCapitalExecution,
  PromoteCapitalExecution,
} from "../src/core/execution/CapitalExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let player: Player;
let other: Player;

/** Promote the player's city at `unitId`, running the execution to completion. */
function promote(p: Player, unitId: number) {
  const exec = new PromoteCapitalExecution(p, unitId);
  exec.init(game, 0);
  exec.tick(0);
}

function demote(p: Player, unitId: number) {
  const exec = new DemoteCapitalExecution(p, unitId);
  exec.init(game, 0);
  exec.tick(0);
}

describe("Capital", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("player", PlayerType.Human, null, "player_id"),
      new PlayerInfo("other", PlayerType.Human, null, "other_id"),
    ]);
    player = game.player("player_id");
    other = game.player("other_id");
    player.addGold(100_000_000n);
    game.config().structureMinDist = () => 10;
    // The map is half ocean; only take the land tiles.
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t) && !game.hasOwner(t)) {
          player.conquer(t);
        }
      }
    }
  });

  test("promoting a city replaces it with a capital", () => {
    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    promote(player, city.id());

    expect(player.units(UnitType.City).length).toBe(0);
    expect(player.units(UnitType.Capital).length).toBe(1);
  });

  test("promotion carries the city's level over", () => {
    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    city.increaseLevel();
    city.increaseLevel();
    expect(city.level()).toBe(3);

    promote(player, city.id());
    expect(player.units(UnitType.Capital)[0].level()).toBe(3);
  });

  test("only one capital per nation", () => {
    const a = player.buildUnit(UnitType.City, game.ref(5, 8), {});
    const b = player.buildUnit(UnitType.City, game.ref(10, 14), {});
    promote(player, a.id());
    promote(player, b.id());

    expect(player.units(UnitType.Capital).length).toBe(1);
    // The second city is untouched rather than consumed.
    expect(player.units(UnitType.City).length).toBe(1);
  });

  test("a plain capital can be demoted", () => {
    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    promote(player, city.id());
    const capital = player.units(UnitType.Capital)[0];

    expect(canDemoteCapital(game, capital)).toBe(true);
    demote(player, capital.id());
    expect(player.units(UnitType.Capital).length).toBe(0);
    expect(player.units(UnitType.City).length).toBe(1);
  });

  test("a capital stacked with a port is locked and cannot be demoted", () => {
    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    promote(player, city.id());
    const capital = player.units(UnitType.Capital)[0];

    // Stack a port directly onto the capital's site.
    player.buildUnit(UnitType.Port, game.ref(7, 11), {});

    expect(canDemoteCapital(game, capital)).toBe(false);
    demote(player, capital.id());
    expect(player.units(UnitType.Capital).length).toBe(1);
  });

  test("stacking exempts the pair from the structure minimum distance", () => {
    // Ports need a shore tile, so anchor the capital next to one.
    let shore = -1;
    for (let x = 0; x < game.width() && shore < 0; x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isShore(t) && game.owner(t) === player) {
          shore = t;
          break;
        }
      }
    }
    expect(shore).toBeGreaterThanOrEqual(0);

    const city = player.buildUnit(UnitType.City, shore, {});
    promote(player, city.id());

    // canBuild snaps to the nearest legal tile rather than refusing outright,
    // so the meaningful assertion is *where* each one lands.

    // Port stacks onto the capital: it may sit on the capital's own tile.
    expect(player.canBuild(UnitType.Port, shore)).toBe(shore);

    // Control: Factory does not stack, so it is pushed off the capital's tile
    // by the minimum-distance rule. This is what proves the exemption is
    // targeted rather than a blanket hole in the placement rules.
    expect(player.canBuild(UnitType.Factory, shore)).not.toBe(shore);
  });

  test("a capital raises the max troop ceiling", () => {
    const withoutCapital = game.config().maxTroops(player);

    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    promote(player, city.id());
    const withCapital = game.config().maxTroops(player);

    expect(withCapital).toBeGreaterThan(withoutCapital);
    // The city is consumed by promotion, so compare against the capital-less
    // baseline scaled by the bonus rather than against a raw number.
    expect(withCapital / withoutCapital).toBeCloseTo(
      1 + CAPITAL_TROOP_CAP_BONUS,
      5,
    );
  });

  test("losing a capital costs the previous owner 40% of their troops", () => {
    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    promote(player, city.id());
    const capital = player.units(UnitType.Capital)[0];

    player.setTroops(1000);
    capital.setOwner(other);

    expect(player.troops()).toBe(600);
  });

  test("the penalty does not fire when ownership does not actually change", () => {
    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    promote(player, city.id());
    const capital = player.units(UnitType.Capital)[0];

    player.setTroops(1000);
    capital.setOwner(player);

    expect(player.troops()).toBe(1000);
  });
});
