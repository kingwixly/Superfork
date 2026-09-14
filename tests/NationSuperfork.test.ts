import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.join(__dirname, "..");
const BEHAVIOR = path.join(
  ROOT,
  "src/core/execution/nation/NationStructureBehavior.ts",
);

/**
 * The nation AI must use what the superfork adds — a bot that never builds a
 * bank or an airbase makes the fork look broken rather than deep.
 *
 * These assert the wiring exists rather than simulating a full game: a bot's
 * actual build choices depend on gold, terrain and difficulty, so a behavioural
 * test would be slow and flaky. What can be pinned cheaply is that each new
 * structure has a ratio and a slot in the build order, which is what the
 * ratio-driven system needs in order to ever consider one.
 */
describe("Nation AI covers superfork structures", () => {
  const src = readFileSync(BEHAVIOR, "utf8");

  const ratios =
    /function getStructureRatios\([\s\S]*?\n}/.exec(src)?.[0] ?? "";
  const buildOrder =
    /const buildOrder: UnitType\[\] = \[([\s\S]*?)\];/.exec(src)?.[1] ?? "";

  for (const type of ["Bank", "Airstrip", "Airfield", "InternationalAirport"]) {
    test(`${type} has a build ratio`, () => {
      expect(ratios).toContain(`UnitType.${type}`);
    });

    test(`${type} is in the build order`, () => {
      expect(buildOrder).toContain(`UnitType.${type}`);
    });
  }

  test("superfork structures are ordered after the vanilla economy", () => {
    // A nation that builds banks instead of cities and ports ends up poor and
    // small, which reads as a broken bot rather than a varied one.
    const order = [...buildOrder.matchAll(/UnitType\.(\w+)/g)].map((m) => m[1]);
    expect(order.indexOf("Bank")).toBeGreaterThan(order.indexOf("Port"));
    expect(order.indexOf("Bank")).toBeGreaterThan(order.indexOf("Factory"));
    expect(order.indexOf("Airstrip")).toBeGreaterThan(order.indexOf("Bank"));
  });

  test("the AI can promote a capital", () => {
    // A capital is promoted, not built, so it cannot ride the ratio system.
    expect(src).toContain("maybePromoteCapital");
    expect(src).toContain("PromoteCapitalExecution");
  });

  test("capital promotion is gated on having several cities", () => {
    // Promoting the only city hands an early attacker a free decapitation.
    expect(src).toContain("CITIES_BEFORE_CAPITAL");
    const gate = /const CITIES_BEFORE_CAPITAL = (\d+);/.exec(src);
    expect(gate).not.toBeNull();
    expect(Number(gate![1])).toBeGreaterThan(1);
  });
});
