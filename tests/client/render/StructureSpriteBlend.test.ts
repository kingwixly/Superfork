import { describe, expect, it } from "vitest";
import { STRUCTURE_ORDER } from "../../../src/client/render/gl/passes/StructurePass";
import { spriteBlend } from "../../../src/client/render/gl/passes/StructureSpritePass";
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
});
