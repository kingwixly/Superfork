/**
 * Pure (no WebGL) helpers that turn the `settings.fx` slice into per-spawn
 * FX parameters. Kept out of the passes so they can be unit-tested.
 */

import {
  UT_ASBM_WARHEAD,
  UT_ATOM_BOMB,
  UT_EMP_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV_WARHEAD,
  UT_NEUTRON_BOMB,
} from "../../../types";
import type { RenderSettings } from "../../RenderSettings";

/**
 * Visual explosion radius (shockwave / debris scatter — not the gameplay
 * damage radius) for a detonating unit type, or undefined for non-nukes.
 */
export function nukeExplosionRadius(
  fx: RenderSettings["fx"],
  unitType: string,
): number | undefined {
  switch (unitType) {
    case UT_ATOM_BOMB:
      return fx.nukeRadiusAtom;
    case UT_HYDROGEN_BOMB:
      return fx.nukeRadiusHydro;
    case UT_MIRV_WARHEAD:
      return fx.nukeRadiusMirv;
    // Superfork warheads. Returning undefined here is what made them
    // invisible: no radius means no shockwave and no sprite, so a neutron
    // bomb killed an army with nothing on screen at all.
    //
    // Each radius matches what the weapon actually DOES, so they read as
    // different weapons despite sharing explosion palettes: the neutron
    // blast covers the ground it clears, the EMP is the widest since it
    // reaches furthest, and an ASBM warhead is a single ship kill.
    case UT_NEUTRON_BOMB:
      return fx.nukeRadiusNeutron;
    case UT_EMP_BOMB:
      return fx.nukeRadiusEmp;
    case UT_ASBM_WARHEAD:
      return fx.nukeRadiusAsbm;
    default:
      return undefined;
  }
}
