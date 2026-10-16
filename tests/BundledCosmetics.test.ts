/**
 * Superfork: SuperFront's free bundled cosmetics catalog, and the game
 * server's checker that uses it while the official catalog is out of reach.
 */
import {
  BUNDLED_FREE_FLARES,
  bundledCosmetics,
} from "@openfront/shared/BundledCosmetics";
import { EFFECT_TYPES } from "@openfront/shared/CosmeticSchemas";
import { base64url } from "jose";
import { BundledPrivilegeChecker } from "../src/server/Privilege";

const catalog = bundledCosmetics();
const checker = new BundledPrivilegeChecker(catalog, base64url.decode);

test("the bundled catalog parses and has every category but flags", () => {
  expect(Object.keys(catalog.patterns).length).toBeGreaterThan(5);
  expect(Object.keys(catalog.crowns ?? {}).length).toBeGreaterThan(0);
  expect(Object.keys(catalog.skins ?? {}).length).toBeGreaterThan(0);
  for (const type of EFFECT_TYPES) {
    expect(Object.keys(catalog.effects?.[type] ?? {}).length).toBeGreaterThan(
      0,
    );
  }
  // Every palette a pattern names exists.
  for (const p of Object.values(catalog.patterns)) {
    for (const pal of p.colorPalettes ?? []) {
      expect(catalog.colorPalettes?.[pal.name]).toBeDefined();
    }
  }
});

test("everything in it is free: no flares needed", () => {
  const pattern = Object.values(catalog.patterns)[0];
  const palette = pattern.colorPalettes![0].name;
  const crown = Object.keys(catalog.crowns!)[0];
  const skin = Object.keys(catalog.skins!)[0];
  const trail = Object.keys(catalog.effects!.nukeTrail!)[0];
  const result = checker.isAllowed([], {
    patternName: pattern.name,
    patternColorPaletteName: palette,
    crownName: crown,
    skinName: skin,
    effects: { nukeTrail: trail },
    flag: "country:us",
  });
  expect(result.type).toBe("allowed");
  if (result.type !== "allowed") return;
  expect(result.cosmetics.pattern?.name).toBe(pattern.name);
  expect(result.cosmetics.pattern?.colorPalette?.name).toBe(palette);
  expect(result.cosmetics.crown?.url).toBe(`/cosmetics/crowns/${crown}.svg`);
  expect(result.cosmetics.skin?.name).toBe(skin);
  expect(result.cosmetics.effects?.nukeTrail?.name).toBe(trail);
  // Country flags survive too (the old fallback dropped every cosmetic).
  expect(result.cosmetics.flag).toBe("/flags/us.svg");
});

test("a stale selection is dropped alone instead of refusing the join", () => {
  const crown = Object.keys(catalog.crowns!)[0];
  const result = checker.isAllowed([], {
    patternName: "no_such_pattern",
    crownName: crown,
    effects: { nukeTrail: "gone", atom: "also_gone" },
    flag: "country:us",
  });
  expect(result.type).toBe("allowed");
  if (result.type !== "allowed") return;
  expect(result.cosmetics.pattern).toBeUndefined();
  expect(result.cosmetics.effects).toBeUndefined();
  expect(result.cosmetics.crown?.name).toBe(crown);
  expect(result.cosmetics.flag).toBe("/flags/us.svg");
});

test("the admin-only flags still need the developer flare", () => {
  const r = checker.isAllowed([], { flag: "country:Michael Jackson" });
  expect(r.type === "allowed" && r.cosmetics.flag).toBeFalsy();
  expect(BUNDLED_FREE_FLARES).not.toContain("superfront:developer");
});
