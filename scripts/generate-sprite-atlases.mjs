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

/**
 * Unit atlas columns appended by the superfork.
 *
 * The unit atlas is 13px cells and pre-existing columns 0-11 were never
 * shipped as loose sources, so this script only *appends* to it: the existing
 * atlas is loaded and new columns are composited on the right. Regenerating
 * the first twelve would mean reconstructing art we do not have.
 *
 * Sprites are greyscale masks; the GPU replaces 180/130/70 with the player's
 * territory, mid and border colours. Each is centred in its cell.
 */
const UNIT_COLUMNS = [
  "fighter_jet",
  "transport_jet",
  "cargo_jet",
  "airliner",
  "interceptor",
];

const UNIT_CELL = 13;
const UNIT_SRC_DIR = join(ROOT, "resources/icons/units");
const UNIT_OUT = join(ROOT, "resources/atlases/unit-atlas.png");

async function buildUnitAtlas() {
  const existing = await sharp(UNIT_OUT).metadata();
  const baseCols = Math.round(existing.width / UNIT_CELL);
  const width = UNIT_CELL * (baseCols + UNIT_COLUMNS.length);

  const composites = [{ input: UNIT_OUT, left: 0, top: 0 }];
  for (let i = 0; i < UNIT_COLUMNS.length; i++) {
    const file = join(UNIT_SRC_DIR, `${UNIT_COLUMNS[i]}.png`);
    if (!existsSync(file)) throw new Error(`missing unit sprite: ${file}`);
    const meta = await sharp(file).metadata();
    if (meta.width > UNIT_CELL || meta.height > UNIT_CELL) {
      throw new Error(
        `${UNIT_COLUMNS[i]}.png is ${meta.width}x${meta.height}, max ${UNIT_CELL}`,
      );
    }
    composites.push({
      input: file,
      left:
        UNIT_CELL * (baseCols + i) + Math.floor((UNIT_CELL - meta.width) / 2),
      top: Math.floor((UNIT_CELL - meta.height) / 2),
    });
  }

  return sharp({
    create: {
      width,
      height: UNIT_CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

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
const unitBuf = await buildUnitAtlas();

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
  await writeFile(UNIT_OUT, unitBuf);
  console.log(
    `wrote ${UNIT_OUT} — +${UNIT_COLUMNS.length} columns x ${UNIT_CELL}px (${UNIT_COLUMNS.join(", ")})`,
  );
}
