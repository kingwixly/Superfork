import { UnitType } from "../../core/game/Game";

/**
 * Everything launched from a Missile Silo. The UI only knew about the three
 * vanilla nukes, so the superfork warheads were never greyed out without a
 * silo, never showed a target circle and never got a flight arc preview.
 */
export const SILO_WEAPONS: ReadonlySet<UnitType> = new Set([
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.NeutronBomb,
  UnitType.EMPBomb,
  UnitType.ASBM,
]);

/** Silo weapons that fly the nuke arc (up/down toggle, trajectory preview). */
export const ARC_WEAPONS: ReadonlySet<UnitType> = new Set([
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.NeutronBomb,
  UnitType.EMPBomb,
]);
