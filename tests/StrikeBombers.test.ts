import {
  BLINDING_DURATION,
  BLINDING_RADIUS,
  CAPITAL_STRIKE_TROOP_LOSS,
} from "../src/core/configuration/SuperforkUnits";
import { capitalPromotionLockedUntil } from "../src/core/execution/CapitalExecution";
import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
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
/** Land tiles, column by column. */
let land: number[];
/** My land: a strip down the east edge. Everything else is the foe's. */
let mine: number[];
let base: number;

async function setupGame() {
  game = await setup("big_plains", { instantBuild: true }, [
    new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
  ]);
  while (game.inSpawnPhase() || game.isSpawnImmunityActive()) {
    game.executeNextTick();
  }
  me = game.player("me_id");
  foe = game.player("foe_id");
  game.config().structureMinDist = () => 1;
  land = [];
  for (let x = 0; x < game.width(); x++) {
    for (let y = 0; y < game.height(); y++) {
      const t = game.ref(x, y);
      if (game.isLand(t)) land.push(t);
    }
  }
  // big_plains is all land, 200x200: the last 20 columns are mine.
  mine = land.slice(-4000);
  for (const t of land.slice(0, -4000)) foe.conquer(t);
  for (const t of mine) me.conquer(t);
  base = game.ref(195, 100);
  me.buildUnit(UnitType.Airfield, base, {});
  me.addGold(200_000_000n);
}

function order(type: UnitType, at: number) {
  game.addExecution(new ConstructionExecution(me, type, at));
}

function run(ticks: number) {
  for (let i = 0; i < ticks; i++) game.executeNextTick();
}

/** Buy a strategic bomber at the airfield, as the Air tab does. */
function buy(type: UnitType.StealthBomber | UnitType.LargeBomber) {
  order(type, base);
  run(2);
}

/** A foe tile well inside their land, away from the edges. */
function foeTile(): number {
  return game.ref(60, 100);
}

describe("Strike bombers", () => {
  beforeEach(setupGame);

  test("a strike needs a bomber you own; it flies, strikes, and comes home", () => {
    const target = foeTile();
    const gold = me.gold();
    // No bomber yet: the order does nothing and costs nothing.
    order(UnitType.BunkerBuster, target);
    run(2);
    expect(me.units(UnitType.StealthBomber).length).toBe(0);
    expect(me.gold()).toBe(gold);

    buy(UnitType.StealthBomber);
    expect(me.units(UnitType.StealthBomber).length).toBe(1);
    expect(me.gold()).toBe(gold - 4_000_000n);

    // The strike itself costs only its payload.
    expect(game.config().unitInfo(UnitType.BunkerBuster).cost(game, me)).toBe(
      2_500_000n,
    );
    const city = foe.buildUnit(UnitType.City, target, {});
    order(UnitType.BunkerBuster, target);
    run(2);
    expect(me.gold()).toBe(gold - 4_000_000n - 2_500_000n);
    run(2000);
    expect(city.isActive()).toBe(false);
    const bomber = me.units(UnitType.StealthBomber)[0];
    expect(bomber.isActive()).toBe(true);
    expect(bomber.tile()).toBe(base);
  });

  test("the same bomber flies strike after strike", () => {
    buy(UnitType.StealthBomber);
    order(UnitType.BlindingBomb, foeTile());
    run(2000);
    order(UnitType.BlindingBomb, foeTile());
    run(2);
    expect(me.units(UnitType.StealthBomber).length).toBe(1);
  });

  test("a bunker buster demotes a plain capital, costs troops and locks promotion", () => {
    buy(UnitType.StealthBomber);
    const target = foeTile();
    const capital = foe.buildUnit(UnitType.Capital, target, {});
    foe.setTroops(100_000);
    order(UnitType.BunkerBuster, target);
    for (let i = 0; i < 2000 && capital.isActive(); i++) {
      game.executeNextTick();
    }
    expect(capital.isActive()).toBe(false);
    expect(foe.units(UnitType.Capital).length).toBe(0);
    // Demoted, not destroyed: the city stands.
    expect(foe.units(UnitType.City).some((c) => c.tile() === target)).toBe(
      true,
    );
    expect(foe.troops()).toBeLessThanOrEqual(
      100_000 * (1 - CAPITAL_STRIKE_TROOP_LOSS) + 5_000,
    );
    expect(capitalPromotionLockedUntil(foe)).toBeGreaterThan(game.ticks());
  });

  test("a capital locked by a stacked airport is destroyed instead", () => {
    buy(UnitType.StealthBomber);
    const target = foeTile();
    const capital = foe.buildUnit(UnitType.Capital, target, {});
    foe.buildUnit(UnitType.InternationalAirport, target + 1, {});
    order(UnitType.BunkerBuster, target);
    run(2000);
    expect(capital.isActive()).toBe(false);
    expect(foe.units(UnitType.Capital).length).toBe(0);
    expect(foe.units(UnitType.City).some((c) => c.tile() === target)).toBe(
      false,
    );
  });

  test("a blinding bomb takes SAMs and silos offline, and nothing else", () => {
    buy(UnitType.StealthBomber);
    const target = foeTile();
    const sam = foe.buildUnit(UnitType.SAMLauncher, target, {});
    const city = foe.buildUnit(UnitType.City, target + 2, {});
    order(UnitType.BlindingBomb, target);
    let disabledAt = -1;
    for (let i = 0; i < 2000 && disabledAt < 0; i++) {
      game.executeNextTick();
      if (sam.isDisabled()) disabledAt = game.ticks();
    }
    expect(disabledAt).toBeGreaterThan(0);
    expect(sam.isActive()).toBe(true);
    expect(city.isActive()).toBe(true);
    expect(city.isDisabled()).toBe(false);
    run(BLINDING_DURATION + 5);
    expect(sam.isDisabled()).toBe(false);
    expect(BLINDING_RADIUS).toBeGreaterThan(0);
  });

  test("a large bomber drops an atom bomb straight down", () => {
    const target = foeTile();
    expect(game.config().unitInfo(UnitType.LargeBomber).cost(game, me)).toBe(
      10_000_000n,
    );
    buy(UnitType.LargeBomber);
    expect(me.units(UnitType.LargeBomber).length).toBe(1);
    // The drop costs exactly an atom bomb.
    expect(game.config().unitInfo(UnitType.BomberAtomDrop).cost(game, me)).toBe(
      750_000n,
    );
    const tilesBefore = foe.numTilesOwned();
    order(UnitType.BomberAtomDrop, target);
    run(3000);
    expect(foe.numTilesOwned()).toBeLessThan(tilesBefore);
    expect(game.owner(target).isPlayer()).toBe(false);
  });

  test("every new large bomber costs more, even after losing one", () => {
    buy(UnitType.LargeBomber);
    me.units(UnitType.LargeBomber)[0].delete(false);
    run(2);
    const next = game.config().unitInfo(UnitType.LargeBomber).cost(game, me);
    expect(next).toBe(15_000_000n);
  });

  test("a loaded large bomber that is shot down blows up where it falls", () => {
    buy(UnitType.LargeBomber);
    order(UnitType.BomberHydrogenDrop, foeTile());
    run(40);
    const bomber = me.units(UnitType.LargeBomber)[0];
    const at = bomber.tile();
    expect(me.units(UnitType.LargeBomber).length).toBe(1);
    bomber.delete(true, foe);
    run(5);
    expect(game.owner(at).isPlayer()).toBe(false);
  });
});
