import {
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
let me: Player;
let land: number[];

function promote(tile: number) {
  const city = me.buildUnit(UnitType.City, tile, {});
  const e = new PromoteCapitalExecution(me, city.id());
  e.init(game, 0);
  e.tick(0);
  return me.units(UnitType.Capital)[0];
}

describe("Capital stacking and population", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    ]);
    me = game.player("me_id");
    me.addGold(1_000_000_000n);
    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    for (const t of land) me.conquer(t);
  });

  test("promoting a city does not LOWER the population ceiling", () => {
    const city = me.buildUnit(UnitType.City, land[0], {});
    city.increaseLevel();
    city.increaseLevel();
    const before = game.config().maxTroops(me);

    const e = new PromoteCapitalExecution(me, city.id());
    e.init(game, 0);
    e.tick(0);

    // maxTroops used to sum UnitType.City only, so the promoted city's level
    // dropped out and promoting cost troops instead of granting a buff.
    expect(game.config().maxTroops(me)).toBeGreaterThanOrEqual(before);
  });

  test("a capital's level counts toward population like a city's", () => {
    const cap = promote(land[0]);
    const base = game.config().maxTroops(me);
    cap.increaseLevel();
    expect(game.config().maxTroops(me)).toBeGreaterThan(base);
  });

  test("building a City onto a Capital levels the capital up", () => {
    const cap = promote(land[0]);
    const levelBefore = cap.level();

    const target = me.findUnitToUpgrade(UnitType.City, land[0]);
    expect(target).not.toBe(false);
    expect(target !== false && target.type()).toBe(UnitType.Capital);

    if (target !== false) target.increaseLevel();
    expect(cap.level()).toBe(levelBefore + 1);
  });

  test("airports no longer stack onto capitals", () => {
    const cap = promote(land[0]);
    const spawn = me.canBuild(UnitType.InternationalAirport, cap.tile()!);
    // Stacking used to place the airport ON the capital's tile, where it
    // rendered underneath and appeared to vanish.
    expect(spawn).not.toBe(cap.tile());
  });

  test.each([
    UnitType.Airstrip,
    UnitType.Airfield,
    UnitType.InternationalAirport,
  ])("%s upgrades by stacking onto itself", (type) => {
    const base = me.buildUnit(type, land[0], {});
    const target = me.findUnitToUpgrade(type, land[0]);
    expect(target).not.toBe(false);
    expect(target !== false && target.id()).toBe(base.id());
  });

  test("a port can still stack onto a coastal capital", () => {
    let shore = -1;
    for (const t of land) {
      if (game.isShore(t)) {
        shore = t;
        break;
      }
    }
    const cap = promote(shore);
    expect(me.canBuild(UnitType.Port, cap.tile()!)).toBe(cap.tile());
  });
  test("levelling a capital charges the City price and counts as a city", () => {
    const cap = promote(land[0]);
    const cityPrice = game.unitInfo(UnitType.City).cost(game, me);
    expect(cityPrice).toBeGreaterThan(0n);
    const goldBefore = me.gold();
    const builtBefore = me.unitsConstructed(UnitType.City);

    expect(me.canUpgradeUnit(cap)).toBe(true);
    me.upgradeUnit(cap);

    // Used to charge the Capital's own price (zero) and record a Capital, so
    // levelling the capital was free and never raised the next city's price.
    expect(goldBefore - me.gold()).toBe(cityPrice);
    expect(me.unitsConstructed(UnitType.City)).toBe(builtBefore + 1);
    expect(game.unitInfo(UnitType.City).cost(game, me)).toBeGreaterThan(
      cityPrice,
    );
  });

  test("a broke player cannot level the capital for free", () => {
    const cap = promote(land[0]);
    me.removeGold(me.gold());
    expect(me.canUpgradeUnit(cap)).toBe(false);
  });

  test("promoting a city does not make the next city cheaper", () => {
    const city = me.buildUnit(UnitType.City, land[0], {});
    city.increaseLevel();
    const before = game.unitInfo(UnitType.City).cost(game, me);
    const e = new PromoteCapitalExecution(me, city.id());
    e.init(game, 0);
    e.tick(0);
    expect(game.unitInfo(UnitType.City).cost(game, me)).toBe(before);
  });
  test("demoting the capital back to a city is free", () => {
    const cap = promote(land[0]);
    cap.increaseLevel();
    const gold = me.gold();
    const e = new DemoteCapitalExecution(me, cap.id());
    e.init(game, 0);
    e.tick(0);
    // buildUnit charged the full city price, so demoting cost money.
    expect(me.gold()).toBe(gold);
    expect(me.units(UnitType.City)[0]?.level()).toBe(2);
  });
});
