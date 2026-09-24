import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.join(__dirname, "..");
const EN = JSON.parse(
  readFileSync(path.join(ROOT, "resources/lang/en.json"), "utf8"),
);

function resolve(key: string): unknown {
  let cur: unknown = EN;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Tooltips fail SILENTLY: a missing key renders as the raw key or as nothing,
 * and no test catches it because nothing throws. This has now shipped twice -
 * once as raw keys from module-scope translateText, once as a doubled
 * "unit_type.unit_type.x" prefix - so the keys are pinned here.
 */
describe("Tooltip translation keys resolve", () => {
  test("every radial menu tooltip key exists", () => {
    const src = readFileSync(
      path.join(ROOT, "src/client/hud/layers/RadialMenuElements.ts"),
      "utf8",
    );
    const keys = [...src.matchAll(/key: "([a-z_]+\.[a-z_.]+)"/g)].map(
      (m) => m[1],
    );
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter((k) => resolve(k) === undefined)).toEqual([]);
  });

  test("every build item has a name AND a description", () => {
    // The bottom bar prefixes the bare key with unit_type. and
    // build_menu.desc. itself, so BOTH namespaces must have an entry or the
    // tooltip renders blank.
    const src = readFileSync(
      path.join(ROOT, "src/client/hud/layers/BuildMenu.ts"),
      "utf8",
    );
    const bare = [...src.matchAll(/key: "unit_type\.([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect(bare.length).toBeGreaterThan(15);

    const missingName = bare.filter(
      (k) => resolve(`unit_type.${k}`) === undefined,
    );
    const missingDesc = bare.filter(
      (k) => resolve(`build_menu.desc.${k}`) === undefined,
    );
    expect({ missingName, missingDesc }).toEqual({
      missingName: [],
      missingDesc: [],
    });
  });

  test("build menu tab labels exist", () => {
    const src = readFileSync(
      path.join(ROOT, "src/client/hud/layers/BuildMenu.ts"),
      "utf8",
    );
    const labels = [...src.matchAll(/labelKey: "([a-z_.]+)"/g)].map(
      (m) => m[1],
    );
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((k) => resolve(k) === undefined)).toEqual([]);
  });
});
