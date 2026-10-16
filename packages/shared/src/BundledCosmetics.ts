import catalog from "resources/cosmetics/superfront.json" with { type: "json" };
import { Cosmetics, CosmeticsSchema } from "./CosmeticSchemas";

/**
 * Superfork: SuperFront's own cosmetics catalog, free for everyone.
 *
 * OpenFront's patterns, crowns, skins and effects live in its closed catalog
 * server, which SuperFront doesn't have. When that server can't be reached
 * (on SuperFront: always), the client and the game server both fall back to
 * this bundled catalog, and every item in it counts as owned. Built by
 * scripts/superfront-cosmetics/generate.py.
 */
export const BUNDLED_FREE_FLARES: readonly string[] = [
  "pattern:*",
  "flag:*",
  "crown:*",
  "skin:*",
  "effect:*",
];

let parsed: Cosmetics | null = null;

export function bundledCosmetics(): Cosmetics {
  parsed ??= CosmeticsSchema.parse(catalog);
  return parsed;
}
