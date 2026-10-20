/**
 * Superfork: SuperFront's free bundled cosmetics catalog, and the game
 * server's checker that uses it while the official catalog is out of reach.
 */
import {
  ADMIN_FLARES,
  BUNDLED_FREE_FLARES,
  bundledCosmetics,
  bundledItemForFlare,
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

test("bought items are allowed; unowned ones are dropped, flags stay free", () => {
  const pattern = Object.values(catalog.patterns)[0];
  const palette = pattern.colorPalettes![0].name;
  const crown = Object.keys(catalog.crowns!)[0];
  const skin = Object.keys(catalog.skins!)[0];
  const trail = Object.keys(catalog.effects!.nukeTrail!)[0];
  const refs = {
    patternName: pattern.name,
    patternColorPaletteName: palette,
    crownName: crown,
    skinName: skin,
    effects: { nukeTrail: trail },
    flag: "country:us",
  };
  const none = checker.isAllowed([], refs);
  expect(none.type).toBe("allowed");
  if (none.type !== "allowed") return;
  expect(none.cosmetics.pattern).toBeUndefined();
  expect(none.cosmetics.crown).toBeUndefined();
  // Country flags are free for everyone.
  expect(none.cosmetics.flag).toBe("/flags/us.svg");

  const owned = checker.isAllowed(
    [
      `pattern:${pattern.name}:${palette}`,
      `crown:${crown}`,
      `skin:${skin}`,
      `effect:${trail}`,
    ],
    refs,
  );
  expect(owned.type).toBe("allowed");
  if (owned.type !== "allowed") return;
  expect(owned.cosmetics.pattern?.name).toBe(pattern.name);
  expect(owned.cosmetics.crown?.url).toBe(`/cosmetics/crowns/${crown}.svg`);
  expect(owned.cosmetics.skin?.name).toBe(skin);
  expect(owned.cosmetics.effects?.nukeTrail?.name).toBe(trail);
});

test("admins own the whole catalog", () => {
  const crown = Object.keys(catalog.crowns!)[0];
  const r = checker.isAllowed([...ADMIN_FLARES], { crownName: crown });
  expect(r.type === "allowed" && r.cosmetics.crown?.name).toBe(crown);
});

test("every item has a price lookup", () => {
  for (const c of Object.keys(catalog.crowns!)) {
    expect(bundledItemForFlare(`crown:${c}`)).not.toBeNull();
  }
  const p = Object.values(catalog.patterns)[0];
  expect(
    bundledItemForFlare(`pattern:${p.name}:${p.colorPalettes![0].name}`),
  ).not.toBeNull();
  expect(bundledItemForFlare(`pattern:${p.name}:no_such_palette`)).toBeNull();
  expect(bundledItemForFlare("crown:nope")).toBeNull();
});

test("a stale selection is dropped alone instead of refusing the join", () => {
  const crown = Object.keys(catalog.crowns!)[0];
  const result = checker.isAllowed([`crown:${crown}`], {
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
