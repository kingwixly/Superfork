/**
 * Superfork unit specifications.
 *
 * Every unit type the superfork adds is described here in one place, rather
 * than as another arm of the `Config.unitInfo()` switch. Two reasons:
 *
 *  1. `Config.ts` is already 1,246 lines. Nineteen more switch arms makes it
 *     unnavigable.
 *  2. Rebasing onto future upstream betas. Upstream will keep editing that
 *     switch; every arm we add there is a merge conflict waiting to happen.
 *     A one-line delegation is not.
 *
 * `Config` reads this table and converts specs into `UnitInfo` using its own
 * `costWrapper`, so infinite-gold cheats, per-player unit counting and
 * instant-build all keep working exactly as they do for vanilla units.
 *
 * BALANCE STATUS: first pass. These numbers are anchored against vanilla
 * (City/Port 125k·pow2, SAM 1.5M, Silo 1M, Warship 250k/ea, Atom 750k,
 * Hydrogen 5M, MIRV 25M) so the economy stays recognisable, but none of it
 * has been played. Phase 7 is the real balance pass.
 */

import { pow2 } from "../DetMath";
import { PlayerType, UnitType } from "../game/Game";

/** Which medium a unit moves through. Drives pathing and interception rules. */
export enum UnitDomain {
  Structure = "Structure",
  Land = "Land",
  Sea = "Sea",
  Air = "Air",
}

export interface SuperforkUnitSpec {
  domain: UnitDomain;

  /**
   * Cost curve, as a function of how many qualifying units the player already
   * owns. Wrapped by `Config.costWrapper`, so returning a plain number here is
   * enough — bigint conversion and cheat handling happen there.
   */
  cost: (numUnits: number) => number;

  /**
   * Unit types counted toward the cost curve's `numUnits`. Defaults to the
   * spec's own type. Listing several makes them share a price ladder, the way
   * vanilla Port and Factory do.
   */
  costCountsToward?: UnitType[];

  maxHealth?: number;
  damage?: number;

  /** Construction time in ticks (10 ticks = 1s), before `instantBuild`. */
  constructionDuration?: number;

  upgradable?: boolean;

  /**
   * Operating radius in tiles. For bases, how far their aircraft range. For
   * combatants, engagement range. For interceptors, intercept radius.
   */
  range?: number;

  /** Tiles per tick. Vanilla transport boats are ~1 for reference. */
  speed?: number;

  /** Troop capacity, for anything that carries troops. */
  troopCapacity?: number;
}

const TICKS_PER_SECOND = 10;
const s = (seconds: number) => seconds * TICKS_PER_SECOND;

/**
 * Bank reserve cap, and the share of player income each bank accrues.
 *
 * Dani's spec: banks store up to 50M, earning 900k per 1M of player income.
 * Note this is per-bank and not taken out of the player's own income — banks
 * mint alongside it rather than skimming it. Capturing a bank transfers its
 * whole accrued reserve to the captor, which is what makes them worth raiding.
 */
export const BANK_RESERVE_CAP = 50_000_000n;
export const BANK_ACCRUAL_NUMERATOR = 900_000n;
export const BANK_ACCRUAL_DENOMINATOR = 1_000_000n;

/** Capital effects, per spec. */
export const CAPITAL_TROOP_CAP_BONUS = 0.1; // +10% max troop capacity
export const CAPITAL_CAPTURE_TROOP_LOSS = 0.4; // -40% troops when captured

/**
 * Structure stacking.
 *
 * Vanilla enforces `structureMinDist` between every pair of structures, which
 * is what makes them one-per-site. Rather than restructuring tiles to hold
 * multiple units, stacking is modelled as a targeted exemption from that rule:
 * a listed pair may be placed arbitrarily close, and "stacked" thereafter
 * means "within STACK_RADIUS of each other".
 *
 * This keeps the change small and leaves every existing placement rule intact
 * for every pair not named here.
 */
export const STACK_RADIUS = 2;

const STACKABLE_PAIRS: ReadonlyArray<readonly [UnitType, UnitType]> = [
  // A coastal capital can host a port, and any capital can host an
  // international airport. Both directions are handled by canStack below.
  [UnitType.Capital, UnitType.Port],
  [UnitType.Capital, UnitType.InternationalAirport],
];

/** True when the two types are allowed to occupy the same site. */
export function canStack(a: UnitType, b: UnitType): boolean {
  return STACKABLE_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/**
 * Structures that, once stacked onto a capital, lock it permanently.
 *
 * Dani's rule: a capital cannot be demoted unless it is destroyed, or unless
 * it is a plain capital — not a multi-structured port city or airport city.
 * So placing either of these is the commitment; before that the capital can
 * still be moved.
 */
export const CAPITAL_LOCKING_STRUCTURES: ReadonlyArray<UnitType> = [
  UnitType.Port,
  UnitType.InternationalAirport,
];

/** Embassy seizure effects, per spec. */
export const EMBASSY_SLOW_DURATION = s(3);
export const EMBASSY_TROOP_PENALTY = 0.1; // -10% of the loser's troops

/**
 * Warship interception radius, in tiles.
 *
 * Deliberately well under a SAM launcher's. A warship can reposition its
 * anti-nuke coverage and a SAM site cannot, so mobility is what the smaller
 * area pays for.
 */
export const WARSHIP_INTERCEPT_RANGE = 45;

export const SUPERFORK_UNITS: Record<string, SuperforkUnitSpec> = {
  // ------------------------------- Structures -------------------------------

  [UnitType.Bank]: {
    domain: UnitDomain.Structure,
    // Same pow2 ladder as City, priced slightly above it: banks are pure
    // economy with no territorial value, so they should lag city expansion
    // rather than replace it.
    cost: (n) => Math.min(1_200_000, pow2(n) * 150_000),
    constructionDuration: s(4),
    upgradable: true,
  },

  [UnitType.Capital]: {
    domain: UnitDomain.Structure,
    // FREE by design. A capital is promoted from a city you already paid for,
    // and it carries a -40% troop penalty if captured - the commitment is the
    // risk, not the price. Zero rather than unchecked: buildUnit calls
    // removeGold regardless, and removeGold clamps to the balance, so any
    // non-zero cost here would silently drain a poor player.
    cost: () => 0,
    constructionDuration: s(10),
  },

  [UnitType.Embassy]: {
    domain: UnitDomain.Structure,
    // Flat and cheap. The cost of an embassy is diplomatic, not economic —
    // you are handing a foreign power a foothold and a debuff trigger.
    cost: () => 500_000,
    constructionDuration: s(5),
  },

  [UnitType.Airstrip]: {
    domain: UnitDomain.Structure,
    cost: (n) => Math.min(2_000_000, (n + 1) * 750_000),
    constructionDuration: s(8),
    range: 180,
  },

  [UnitType.Airfield]: {
    domain: UnitDomain.Structure,
    // Dearer than an airstrip: this is the "save up for it" gate on air
    // transport, which is twice as fast as boats and launches from cover.
    cost: (n) => Math.min(3_000_000, (n + 1) * 1_000_000),
    constructionDuration: s(10),
    range: 200,
  },

  [UnitType.InternationalAirport]: {
    domain: UnitDomain.Structure,
    // pow2 ladder, like Port — it is the air-domain analogue and should scale
    // the same way trade infrastructure does.
    cost: (n) => Math.min(4_000_000, pow2(n) * 500_000),
    constructionDuration: s(15),
    upgradable: true,
    range: 250,
  },

  // -------------------------------- Aircraft --------------------------------

  [UnitType.FighterJet]: {
    domain: UnitDomain.Air,
    cost: (n) => Math.min(1_500_000, (n + 1) * 400_000),
    maxHealth: 600,
    speed: 2,
    range: 60,
  },

  [UnitType.TransportJet]: {
    domain: UnitDomain.Air,
    // Flat, like vanilla transport boats — this is a per-sortie cost, not an
    // accumulating fleet.
    cost: () => 300_000,
    maxHealth: 400,
    speed: 2, // 2x boats, per spec
    troopCapacity: 1,
  },

  // Civilian traffic is spawned by airports rather than bought, exactly as
  // trade ships are spawned by ports. Cost 0 by design.
  [UnitType.CargoJet]: {
    domain: UnitDomain.Air,
    cost: () => 0,
    maxHealth: 200,
    speed: 1.5,
  },

  [UnitType.Airliner]: {
    domain: UnitDomain.Air,
    cost: () => 0,
    maxHealth: 150,
    speed: 1.75,
  },

  [UnitType.Interceptor]: {
    domain: UnitDomain.Air,
    // Expensive and deliberately fragile. It is the only thing that can kill a
    // MIRV before separation, and that capability is balanced by dying to any
    // fighter that finds it — see maxHealth against FighterJet's damage.
    cost: (n) => Math.min(2_500_000, (n + 1) * 800_000),
    maxHealth: 350,
    speed: 1.75,
    range: 120, // generous intercept envelope
  },

  [UnitType.AAMissile]: {
    domain: UnitDomain.Air,
    cost: () => 0,
    damage: 300,
    speed: 4,
  },

  // ---------------------------------- Ships ----------------------------------

  [UnitType.Destroyer]: {
    domain: UnitDomain.Sea,
    // Inherits vanilla Warship's price and health verbatim - the old warship
    // role lives on here. Shares a cost ladder with Warship (see Config) so
    // building one does not dodge the other's pricing.
    cost: (n) => Math.min(1_000_000, (n + 1) * 250_000),
    costCountsToward: [UnitType.Destroyer, UnitType.Warship],
    maxHealth: 1000,
    speed: 1,
    range: 90,
  },

  [UnitType.Corvette]: {
    domain: UnitDomain.Sea,
    // Cheap and individually weak — the design intent is swarms. Carries
    // troops, which is what makes it "land on sea".
    cost: (n) => Math.min(600_000, (n + 1) * 150_000),
    maxHealth: 500,
    speed: 1.25,
    range: 60,
    troopCapacity: 1,
  },

  [UnitType.Carrier]: {
    domain: UnitDomain.Sea,
    // The most expensive conventional unit in the game. It is a mobile
    // airstrip, so it should cost meaningfully more than the airstrip plus a
    // destroyer, or nobody would ever build the static version.
    cost: (n) => Math.min(6_000_000, (n + 1) * 3_000_000),
    maxHealth: 1500,
    speed: 0.75, // slow and vulnerable without escorts
    range: 180, // matches Airstrip's aircraft range
  },

  // -------------------------------- Warheads --------------------------------

  [UnitType.ASBM]: {
    domain: UnitDomain.Air,
    // Between Hydrogen (5M) and MIRV (25M). It is MIRV-like in mechanism but
    // strictly anti-ship, so it should never be the general-purpose choice.
    cost: () => 15_000_000,
  },

  [UnitType.ASBMWarhead]: {
    domain: UnitDomain.Air,
    cost: () => 0,
  },

  [UnitType.NeutronBomb]: {
    domain: UnitDomain.Air,
    // Cheaper than a Hydrogen bomb because it razes nothing — you are paying
    // for the troops it kills, and inheriting intact infrastructure is the
    // reward for the tempo cost of taking the ground afterwards.
    cost: () => 3_000_000,
  },

  [UnitType.EMPBomb]: {
    domain: UnitDomain.Air,
    // Disables rather than destroys, so it is priced below the neutron bomb.
    // Its value is tempo — grounding an air force and blinding SAMs for a
    // window — not attrition.
    cost: () => 2_500_000,
  },
};

/**
 * Whether a player may use superfork systems at all.
 *
 * **Tribes are excluded.** They exist to be rolled over in the opening minutes
 * — deliberately weak, easily forgotten, and not participants in the wider
 * game. Letting them build banks and carriers or sign treaties would make the
 * early game noisy and would waste simulation on nations nobody interacts
 * with after the first few minutes.
 *
 * `PlayerType.Bot` is exactly the tribe set (see TribeSpawner); the real
 * nation AI is `PlayerType.Nation` and is expected to use everything — that is
 * Phase 8's job.
 *
 * Applied at `PlayerImpl.canBuild`, so it covers every superfork unit in one
 * place, and re-checked in the diplomacy executions, which do not route
 * through building at all.
 */
export function canUseSuperforkSystems(type: PlayerType): boolean {
  return type !== PlayerType.Bot;
}

/** Lookup used by `Config.unitInfo()`. Returns undefined for vanilla types. */
export function superforkUnitSpec(
  type: UnitType,
): SuperforkUnitSpec | undefined {
  return SUPERFORK_UNITS[type];
}
