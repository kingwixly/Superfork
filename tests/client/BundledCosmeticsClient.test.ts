/**
 * Superfork: with no catalog server the client uses the bundled catalog and
 * treats all of it as owned.
 */
import { bundledCosmetics } from "@openfront/shared/BundledCosmetics";
import { vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("a failed catalog fetch falls back to the bundled catalog; flags free, the rest bought", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const c = await import("../../src/client/Cosmetics");
  c.invalidateCosmetics();
  const catalog = await c.fetchCosmetics();
  expect(catalog).toEqual(bundledCosmetics());
  expect(c.usingBundledCosmetics()).toBe(true);
  const pattern = Object.values(catalog!.patterns)[0];
  expect(
    c.patternRelationship(pattern, pattern.colorPalettes![0], false, null),
  ).not.toBe("owned");
  const crown = Object.values(catalog!.crowns!)[0];
  expect(c.crownRelationship(crown, false, null)).not.toBe("owned");
  expect(c.playerFlares(false)).toContain("flag:*");
  expect(c.playerFlares(false)).not.toContain("effect:*");
});
