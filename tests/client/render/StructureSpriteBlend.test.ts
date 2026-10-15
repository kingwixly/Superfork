import { describe, expect, it } from "vitest";
import { STRUCTURE_ORDER } from "../../../src/client/render/gl/passes/StructurePass";
import {
  spriteBlend,
  spriteTier,
} from "../../../src/client/render/gl/passes/StructureSpritePass";
import { applyGraphicsOverrides } from "../../../src/client/render/gl/RenderOverrides";
import { createRenderSettings } from "../../../src/client/render/gl/RenderSettings";

describe("structure sprites (superfork)", () => {
  it("fade in over the configured zoom range", () => {
    const settings = createRenderSettings();
    const { zoom, fadeRange } = settings.structure.sprites;
    expect(spriteBlend(settings, zoom - 1)).toBe(0);
    expect(spriteBlend(settings, zoom)).toBe(0);
    expect(spriteBlend(settings, zoom + fadeRange / 2)).toBeCloseTo(0.5);
    expect(spriteBlend(settings, zoom + fadeRange)).toBeCloseTo(1);
    expect(spriteBlend(settings, zoom + 50)).toBe(1);
  });

  it("stay off when the player turns them off", () => {
    const settings = createRenderSettings();
    applyGraphicsOverrides(settings, { structure: { sprites: false } });
    expect(spriteBlend(settings, 100)).toBe(0);
  });

  it("have a sprite for every structure the polygon atlas has", async () => {
    const { readdirSync } = await import("node:fs");
    const files = new Set(readdirSync("resources/icons/structures_hd"));
    const names = STRUCTURE_ORDER.map((t) =>
      t.toLowerCase().split(" ").join("_"),
    );
    for (const n of names) expect(files.has(`${n}.png`), n).toBe(true);
  });

  it("pick a level tier from the thresholds", () => {
    const settings = createRenderSettings();
    settings.structure.sprites.levelTiers = {
      default: [3, 6, 10],
      Capital: [2],
    };
    expect(spriteTier(settings, "City", 1)).toBe(0);
    expect(spriteTier(settings, "City", 3)).toBe(1);
    expect(spriteTier(settings, "City", 9)).toBe(2);
    expect(spriteTier(settings, "City", 10)).toBe(3);
    expect(spriteTier(settings, "City", 99)).toBe(3);
    // A type with its own entry ignores the default.
    expect(spriteTier(settings, "Capital", 2)).toBe(1);
    expect(spriteTier(settings, "Capital", 50)).toBe(1);
  });

  it("never pick a row past the atlas", () => {
    const settings = createRenderSettings();
    settings.structure.sprites.levelTiers = { default: [1, 2, 3, 4, 5, 6] };
    expect(spriteTier(settings, "City", 100)).toBe(3);
  });

  it("only ship level art for structures that exist, as 64px tier 2-4 files", async () => {
    const { readdirSync } = await import("node:fs");
    const names = new Set(
      STRUCTURE_ORDER.map((t) => t.toLowerCase().split(" ").join("_")),
    );
    for (const f of readdirSync("resources/icons/structures_hd/levels")) {
      const m = /^(.+)_([234])\.png$/.exec(f);
      expect(m, f).not.toBeNull();
      expect(names.has(m![1]), f).toBe(true);
    }
  });
});
