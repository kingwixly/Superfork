import { describe, expect, test } from "vitest";
import {
  nukeExplosionRadius,
  SUPERFORK_BLAST_MS,
  superforkWarheadExplosion,
} from "../src/client/render/gl/passes/fx-pass/FxSettings";
import { calculateExplosionDurationMs } from "../src/client/render/gl/passes/fx-pass/FxShockwavePass";
import { createRenderSettings } from "../src/client/render/gl/RenderSettings";
import {
  UT_ATOM_BOMB,
  UT_HYDROGEN_BOMB,
  UT_MIRV_WARHEAD,
  UT_WARSHIP,
} from "../src/client/render/types";

describe("nukeExplosionRadius", () => {
  test("reads the per-bomb radius from settings", () => {
    const fx = createRenderSettings().fx;
    fx.nukeRadiusAtom = 11;
    fx.nukeRadiusHydro = 22;
    fx.nukeRadiusMirv = 33;
    expect(nukeExplosionRadius(fx, UT_ATOM_BOMB)).toBe(11);
    expect(nukeExplosionRadius(fx, UT_HYDROGEN_BOMB)).toBe(22);
    expect(nukeExplosionRadius(fx, UT_MIRV_WARHEAD)).toBe(33);
  });

  test("is undefined for non-nuke units", () => {
    expect(nukeExplosionRadius(createRenderSettings().fx, UT_WARSHIP)).toBe(
      undefined,
    );
  });
});

describe("superfork warhead blasts", () => {
  test("EMP and neutron get their own long, coloured blast; atom keeps the default", () => {
    const emp = superforkWarheadExplosion("EMP Burst", 110);
    const neutron = superforkWarheadExplosion("Neutron Bomb", 80);
    expect(emp?.type).toBe("sparkles");
    expect(neutron?.type).toBe("embers");
    // Long enough to notice: the plain ring lasted 1.5s and left nothing.
    for (const p of [emp, neutron]) {
      expect(calculateExplosionDurationMs(p, 1500)).toBeCloseTo(
        SUPERFORK_BLAST_MS,
        0,
      );
    }
    expect(superforkWarheadExplosion("Atom Bomb", 70)).toBeUndefined();
  });
});
