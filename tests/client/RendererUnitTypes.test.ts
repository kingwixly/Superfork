import { STRUCTURE_ORDER } from "../../src/client/render/gl/passes/StructurePass";
import { ALL_UNIT_TYPES } from "../../src/client/render/types";

describe("renderer unit types", () => {
  // The structure passes only draw types the renderer header lists. A
  // structure missing from ALL_UNIT_TYPES shows its level badge and nothing
  // else (how the Lab shipped).
  it("lists every structure the structure atlas draws", () => {
    const known = new Set<string>(ALL_UNIT_TYPES);
    for (const t of STRUCTURE_ORDER) expect(known.has(t), t).toBe(true);
  });
});
