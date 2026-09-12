#!/usr/bin/env node
/**
 * generate-sprite-atlases.mjs
 *
 * Packs the per-icon source PNGs in `resources/icons/` into the horizontal
 * strip atlases the WebGL passes sample.
 *
 * ## Why this exists
 *
 * `StructurePass.ts`, `UnitPass.ts` and `FxSpritePass.ts` all reference a
 * script by this name in their header comments, but it was never committed
 * upstream — only its pre-built output in `resources/atlases/`. That made
 * adding a structure impossible without hand-editing a PNG, which is why
 * Bank and Capital shipped invisible on the map.
 *
 * This is a rebuild, not the original. It is byte-reproducible for the six
 * columns that existed before: those sources were extracted straight out of
 * the shipped atlas, so regenerating leaves them pixel-identical.
 *
 * ## Atlas contract
 *
 * A structure atlas is one row of NxN cells, one cell per column, in exactly
 * the order `STRUCTURE_ORDER` declares in `StructurePass.ts`. **That order is
 * the contract** — the shader indexes columns by position, and `shapeSDF` in
 * `structure.frag.glsl` hardcodes a background shape per index. Adding a
 * column means touching three places:
 *
 *   1. `COLUMNS` below
 *   2. `STRUCTURE_ORDER` in StructurePass.ts
 *   3. a `shapeSDF` arm in structure.frag.glsl
 *
 * ## Only alpha survives
 *
 * The fragment shader samples `iconSample.a` and discards RGB entirely — the
 * glyph is tinted at draw time from the player's palette. Source art is
 * therefore a **white silhouette on transparent**, not colour art. Detailed
 * colour sprites cannot be shown through this pass without a new render path.
 *
 * Usage:  node scripts/generate-sprite-atlases.mjs [--check]
 *         --check verifies the committed atlas matches the sources and exits
 *         non-zero if not, without writing. Useful in CI.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Structure atlas columns, in atlas order.
 * MUST match STRUCTURE_ORDER in src/client/render/gl/passes/StructurePass.ts.
 */
const COLUMNS = [
  "city",
  "port",
  "factory",
  "defense_post",
  "sam_launcher",
  "missile_silo",
  // Superfork additions.
  "bank",
  "capital",
  "airstrip",
  "airfield",
  "international_airport",
];

const CELL = 64;
const SRC_DIR = join(ROOT, "resources/icons/structures");
const OUT = join(ROOT, "resources/atlases/icon-atlas.png");

async function buildStructureAtlas() {
  const composites = [];
  for (let i = 0; i < COLUMNS.length; i++) {
    const file = join(SRC_DIR, `${COLUMNS[i]}.png`);
    if (!existsSync(file)) {
      throw new Error(`missing source icon: ${file}`);
    }
    const meta = await sharp(file).metadata();
    if (meta.width !== CELL || meta.height !== CELL) {
      throw new Error(
        `${COLUMNS[i]}.png is ${meta.width}x${meta.height}, expected ${CELL}x${CELL}`,
      );
    }
    composites.push({ input: file, left: i * CELL, top: 0 });
  }

  return sharp({
    create: {
      width: CELL * COLUMNS.length,
      height: CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const check = process.argv.includes("--check");
const buf = await buildStructureAtlas();

if (check) {
  const existing = await readFile(OUT).catch(() => null);
  // Compare decoded pixels rather than file bytes: PNG encoders differ, and a
  // re-encode with identical pixels is not a real difference.
  const a = await sharp(buf).raw().toBuffer();
  const b = existing ? await sharp(existing).raw().toBuffer() : null;
  if (!b || !a.equals(b)) {
    console.error("icon-atlas.png is out of date — run without --check");
    process.exit(1);
  }
  console.log(`icon-atlas.png up to date (${COLUMNS.length} columns)`);
} else {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, buf);
  console.log(
    `wrote ${OUT} — ${COLUMNS.length} columns x ${CELL}px (${COLUMNS.join(", ")})`,
  );
}
