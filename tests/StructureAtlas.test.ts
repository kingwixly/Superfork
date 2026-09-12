import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.join(__dirname, "..");
const GENERATOR = path.join(ROOT, "scripts/generate-sprite-atlases.mjs");
const STRUCTURE_PASS = path.join(
  ROOT,
  "src/client/render/gl/passes/StructurePass.ts",
);
const SHADER = path.join(
  ROOT,
  "src/client/render/gl/shaders/structure/structure.frag.glsl",
);
const SETTINGS = path.join(ROOT, "src/client/render/gl/render-settings.json");

/**
 * The structure atlas is a positional contract spread across four files, and
 * getting it wrong fails *silently* — StructurePass does
 * `if (atlasIdx === undefined) continue;`, so a structure with no column
 * simply never draws. Bank and Capital shipped that way.
 *
 * These tests make that failure loud.
 */

/** Column order the generator packs, read straight out of the script. */
function generatorColumns(): string[] {
  const src = readFileSync(GENERATOR, "utf8");
  const block = /const COLUMNS = \[([\s\S]*?)\];/.exec(src);
  if (!block) throw new Error("could not find COLUMNS in the generator");
  return [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

/** Atlas order the renderer expects, read out of StructurePass. */
function structureOrder(): string[] {
  const src = readFileSync(STRUCTURE_PASS, "utf8");
  const block = /const STRUCTURE_ORDER = \[([\s\S]*?)\] as const;/.exec(src);
  if (!block) throw new Error("could not find STRUCTURE_ORDER");
  return [...block[1].matchAll(/UT_([A-Z_]+)/g)].map((m) => m[1].toLowerCase());
}

describe("structure atlas contract", () => {
  test("generator column order matches STRUCTURE_ORDER", () => {
    expect(generatorColumns()).toEqual(structureOrder());
  });

  test("every atlas column has a shapeSDF arm", () => {
    const columns = structureOrder().length;
    const src = readFileSync(SHADER, "utf8");
    const body = /float shapeSDF\(vec2 p, float R\) \{([\s\S]*?)\n\}/.exec(src);
    if (body === null) throw new Error("could not find shapeSDF");

    // n-1 explicit `vAtlasIdx < x.5` guards plus one fallthrough return.
    const guards = [...body[1].matchAll(/vAtlasIdx < \d+\.5/g)].length;
    expect(guards).toBe(columns - 1);
  });

  test("every structure has render settings", () => {
    const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
    const shapes = Object.keys(settings.structure.shapes).map((k) =>
      k.toLowerCase().replace(/ /g, "_"),
    );
    expect(shapes).toEqual(structureOrder());
  });

  test("the committed atlas is up to date with its sources", () => {
    // Throws (non-zero exit) if resources/atlases/icon-atlas.png does not
    // match what the sources in resources/icons/structures/ would produce.
    expect(() =>
      execFileSync("node", [GENERATOR, "--check"], { cwd: ROOT }),
    ).not.toThrow();
  });
});
