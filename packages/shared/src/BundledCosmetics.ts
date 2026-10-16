import catalog from "resources/cosmetics/superfront.json" with { type: "json" };
import { Cosmetics, CosmeticsSchema } from "./CosmeticSchemas";

/**
 * Superfork: SuperFront's own cosmetics catalog, free for everyone.
 *
 * OpenFront's patterns, crowns, skins and effects live in its closed catalog
 * server, which SuperFront doesn't have. When that server can't be reached
 * (on SuperFront: always), the client and the game server both fall back to
 * this bundled catalog. Flags are free; everything else is bought with coins
 * (admins own it all). Built by
 * scripts/superfront-cosmetics/generate.py.
 */
export const BUNDLED_FREE_FLARES: readonly string[] = ["flag:*"];

/** What an admin holds: the whole catalog. */
export const ADMIN_FLARES: readonly string[] = [
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

/**
 * The catalog item a flare names, for pricing: "pattern:<name>:<palette>",
 * "crown:<name>", "skin:<name>" or "effect:<name>". Null if the bundled
 * catalog has no such item (flags are free and never priced).
 */
export function bundledItemForFlare(flare: string): { rarity: string } | null {
  const c = bundledCosmetics();
  const [kind, name, palette] = flare.split(":");
  if (name === undefined) return null;
  switch (kind) {
    case "pattern": {
      const p = c.patterns[name];
      if (p === undefined) return null;
      if (
        palette !== undefined &&
        !(p.colorPalettes ?? []).some((cp) => cp.name === palette)
      ) {
        return null;
      }
      return p;
    }
    case "crown":
      return c.crowns?.[name] ?? null;
    case "skin":
      return c.skins?.[name] ?? null;
    case "effect":
      for (const group of Object.values(c.effects ?? {})) {
        const e = group?.[name];
        if (e !== undefined) return e;
      }
      return null;
    default:
      return null;
  }
}
