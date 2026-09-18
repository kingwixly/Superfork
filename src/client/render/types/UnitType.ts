/**
 * Canonical unit type string constants.
 *
 * These match the strings the upstream game sends in UnitEventUpdate.unitType.
 * Use these instead of raw string literals to prevent typos and enable
 * find-all-references.
 */

// ---------------------------------------------------------------------------
// Individual unit type constants
// ---------------------------------------------------------------------------

// Mobile units
export const UT_TRANSPORT = "Transport" as const;
export const UT_TRADE_SHIP = "Trade Ship" as const;
export const UT_WARSHIP = "Warship" as const;
export const UT_ATOM_BOMB = "Atom Bomb" as const;
export const UT_HYDROGEN_BOMB = "Hydrogen Bomb" as const;
export const UT_MIRV = "MIRV" as const;
export const UT_SAM_MISSILE = "SAMMissile" as const;
export const UT_SHELL = "Shell" as const;
export const UT_MIRV_WARHEAD = "MIRV Warhead" as const;
export const UT_TRAIN = "Train" as const;

// Structures
export const UT_CITY = "City" as const;
export const UT_PORT = "Port" as const;
export const UT_FACTORY = "Factory" as const;
export const UT_DEFENSE_POST = "Defense Post" as const;
export const UT_SAM_LAUNCHER = "SAM Launcher" as const;
export const UT_MISSILE_SILO = "Missile Silo" as const;
// Superfork structures.
export const UT_BANK = "Bank" as const;
export const UT_CAPITAL = "Capital" as const;
export const UT_AIRSTRIP = "Airstrip" as const;
export const UT_AIRFIELD = "Airfield" as const;
export const UT_INTERNATIONAL_AIRPORT = "International Airport" as const;
export const UT_EMBASSY = "Embassy" as const;
export const UT_NEUTRON_BOMB = "Neutron Bomb" as const;
export const UT_EMP_BOMB = "EMP Burst" as const;
export const UT_ASBM_WARHEAD = "ASBM Warhead" as const;
// Superfork aircraft.
export const UT_FIGHTER_JET = "Fighter Jet" as const;
export const UT_TRANSPORT_JET = "Transport Jet" as const;
export const UT_CARGO_JET = "Cargo Jet" as const;
export const UT_AIRLINER = "Airliner" as const;
export const UT_INTERCEPTOR = "Interceptor" as const;
// Superfork ships. Destroyer gets its own sprite: it and the reworked
// Warship coexist, so sharing a column would make them indistinguishable
// exactly when telling them apart matters most.
export const UT_CORVETTE = "Corvette" as const;
export const UT_CARRIER = "Carrier" as const;
export const UT_DESTROYER = "Destroyer" as const;

/** Everything that flies. Rendered above structures, ignores terrain. */
export const AIRCRAFT_TYPES: ReadonlySet<string> = new Set([
  UT_FIGHTER_JET,
  UT_TRANSPORT_JET,
  UT_CARGO_JET,
  UT_AIRLINER,
  UT_INTERCEPTOR,
]);

// ---------------------------------------------------------------------------
// Derived sets
// ---------------------------------------------------------------------------

export const STRUCTURE_TYPES: ReadonlySet<string> = new Set([
  UT_CITY,
  UT_PORT,
  UT_FACTORY,
  UT_DEFENSE_POST,
  UT_SAM_LAUNCHER,
  UT_MISSILE_SILO,
  UT_BANK,
  UT_CAPITAL,
  UT_AIRSTRIP,
  UT_AIRFIELD,
  UT_INTERNATIONAL_AIRPORT,
  UT_EMBASSY,
]);

export const NUKE_TYPES: ReadonlySet<string> = new Set([
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
]);

/** Nuke types whose rendered position is interpolated lastPos→pos each render
 *  frame (UnitPass). Their trails stamp only up to lastPos so the tail never
 *  leads the smoothly-moving missile. */
export const SMOOTHED_NUKE_TYPES: ReadonlySet<string> = new Set([
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_MIRV_WARHEAD,
]);

/** Blast radii (in tiles) matching upstream DefaultConfig.nukeMagnitudes(). */
export const NUKE_MAGNITUDES: Readonly<
  Record<string, { inner: number; outer: number }>
> = {
  [UT_ATOM_BOMB]: { inner: 12, outer: 30 },
  [UT_HYDROGEN_BOMB]: { inner: 80, outer: 100 },
  [UT_MIRV_WARHEAD]: { inner: 12, outer: 18 },
};

// ---------------------------------------------------------------------------
// Ordered lists (atlas column order — used by GPU passes + header)
// ---------------------------------------------------------------------------

/** All unit type strings in the canonical order used by RendererConfig.unitTypes. */
export const ALL_UNIT_TYPES = [
  UT_TRANSPORT,
  UT_TRADE_SHIP,
  UT_WARSHIP,
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV,
  UT_SAM_MISSILE,
  UT_SHELL,
  UT_MIRV_WARHEAD,
  UT_CITY,
  UT_PORT,
  UT_FACTORY,
  UT_DEFENSE_POST,
  UT_SAM_LAUNCHER,
  UT_MISSILE_SILO,
  UT_TRAIN,
  UT_BANK,
  UT_CAPITAL,
  UT_AIRSTRIP,
  UT_AIRFIELD,
  UT_INTERNATIONAL_AIRPORT,
  UT_EMBASSY,
  UT_FIGHTER_JET,
  UT_TRANSPORT_JET,
  UT_CARGO_JET,
  UT_AIRLINER,
  UT_INTERCEPTOR,
  UT_CORVETTE,
  UT_CARRIER,
  UT_DESTROYER,
] as const;
