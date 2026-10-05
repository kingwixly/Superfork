/**
 * Pure (no WebGL) helpers that turn the `settings.fx` slice into per-spawn
 * FX parameters. Kept out of the passes so they can be unit-tested.
 */

import type { NukeExplosionRenderParams } from "../../../types";
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

/** How long a superfork warhead's blast stays on screen. */
export const SUPERFORK_BLAST_MS = 2600;

/**
 * Default look for the superfork warheads when the owner has no explosion
 * cosmetic. They used the plain atom ring, which lasts 1.5s and leaves no
 * crater or fallout behind (these weapons do not touch terrain), so in play
 * an EMP or neutron strike flashed by unnoticed. Each now gets a longer,
 * coloured blast that reads as its own weapon:
 *  - EMP: electric-blue sparkles across the whole burst radius
 *  - neutron: sickly green embers
 *  - ASBM warhead: a short orange ring (a single ship kill)
 */
export function superforkWarheadExplosion(
  unitType: string,
  radius: number,
): NukeExplosionRenderParams | undefined {
  const blast = (ms: number, maxRadius: number) => ({
    maxRadius,
    // calculateExplosionDurationMs: duration = (2 * maxRadius / speed) s.
    speed: (maxRadius * 2 * 1000) / ms,
    transitionSpeed: 0.6,
  });
  switch (unitType) {
    case UT_EMP_BOMB:
      return {
        type: "sparkles",
        density: 220,
        colors: [
          [0.35, 0.8, 1],
          [0.85, 0.95, 1],
        ],
        ...blast(SUPERFORK_BLAST_MS, radius * 1.3),
      };
    case UT_NEUTRON_BOMB:
      return {
        type: "embers",
        density: 160,
        colors: [
          [0.55, 1, 0.25],
          [0.95, 1, 0.5],
        ],
        ...blast(SUPERFORK_BLAST_MS, radius * 1.3),
      };
    case UT_ASBM_WARHEAD:
      return {
        type: "shockwave",
        thickness: 3,
        colors: [[1, 0.55, 0.15]],
        ...blast(1200, radius * 1.5),
      };
    default:
      return undefined;
  }
}
