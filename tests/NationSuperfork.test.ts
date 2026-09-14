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

const WARSHIP = path.join(
  ROOT,
  "src/core/execution/nation/NationWarshipBehavior.ts",
);
const AIR = path.join(ROOT, "src/core/execution/nation/NationAirBehavior.ts");
const NATION = path.join(ROOT, "src/core/execution/NationExecution.ts");

describe("Nation AI fields superfork units", () => {
  const warship = readFileSync(WARSHIP, "utf8");
  const air = readFileSync(AIR, "utf8");
  const nation = readFileSync(NATION, "utf8");

  test("the fleet is a composition, not a single warship", () => {
    // Vanilla built exactly one warship ever, which with four hull types
    // would leave three unused.
    for (const hull of ["Destroyer", "Warship", "Corvette", "Carrier"]) {
      expect(warship).toContain(`UnitType.${hull}`);
    }
  });

  test("corvettes are gated behind destroyers", () => {
    // Alone they lose to anything; the design intent is swarms with escorts.
    expect(warship).toMatch(/Corvette[\s\S]*?owned\(UnitType\.Destroyer\) > 0/);
  });

  test("fleet size is bounded", () => {
    expect(warship).toContain("fleetCap");
  });

  test("the air wing is wired into the nation tick", () => {
    // Without this the air bases the structure behaviour builds sit empty.
    expect(nation).toContain("maybeLaunchAircraft");
    expect(nation).toContain("NationAirBehavior");
  });

  test("interceptors are gated behind fighters", () => {
    // An interceptor carries no air-to-air weapon; unescorted it is a free
    // kill, so buying one first wastes the money.
    expect(air).toMatch(/Interceptor[\s\S]*?fighters > 0/);
  });

  test("the air wing only uses bases that can launch the type", () => {
    expect(air).toContain("canLaunch");
  });

  test("disabled bases are skipped", () => {
    // An EMP burst grounds them.
    expect(air).toContain("isDisabled");
  });
});

const DIPLOMACY = path.join(
  ROOT,
  "src/core/execution/nation/NationDiplomacyBehavior.ts",
);

describe("Nation AI diplomacy is conservative", () => {
  const dip = readFileSync(DIPLOMACY, "utf8");
  const nation = readFileSync(NATION, "utf8");

  test("it is wired into the nation tick", () => {
    expect(nation).toContain("NationDiplomacyBehavior");
    expect(nation).toContain("diplomacyBehavior.tick()");
  });

  test("it never sanctions an ally", () => {
    expect(dip).toContain("!this.player.isFriendly(p)");
  });

  test("it only sanctions nations it already treats as hostile", () => {
    // A sanction is the escalation of an embargo, so it follows the same
    // hostility signal vanilla already uses.
    expect(dip).toContain("Relation.Hostile");
  });

  test("it never sanctions a tribe", () => {
    expect(dip).toContain("PlayerType.Bot");
  });

  test("it accepts a ceasefire only when losing", () => {
    // Accepting while ahead throws away a won war.
    expect(dip).toContain("LOSING_RATIO");
  });

  test("it sues for peace to the biggest threat, not a random one", () => {
    expect(dip).toContain("b.troops() > a.troops()");
  });

  test("it leaves the judgement-heavy verbs to humans", () => {
    // Treaties, liberation, cede-land and puppets each need a read of the
    // whole board; a bot doing them badly is worse than not doing them.
    // Checked against actual import statements, not raw text. A substring
    // search over the file matches the prose explaining WHY these are
    // excluded - "deliberately" contains "liberate", which is how this test
    // first failed.
    const imported = [...dip.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const mod of [
      "TreatyExecution",
      "CedeLandExecution",
      "PuppetExecution",
      "LiberationExecution",
    ]) {
      expect(imported.some((i) => i.includes(mod))).toBe(false);
    }
  });
});
