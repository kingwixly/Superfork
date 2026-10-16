import {
  GovernmentIdSchema,
  Progression,
} from "@openfront/engine-api/game/Progression";
import { z } from "zod";

/**
 * Superfork: a guest's coins, research points, cosmetics and research tree,
 * kept in a cookie (no account). The browser sends it with the game socket,
 * so the server reads a guest's unlocks straight from it. It is the guest's
 * own word: anyone can edit their cookie. Accounts are the cheat-proof way.
 */
export const GUEST_COOKIE = "sf_guest";

const GuestSchema = z.object({
  c: z.number().int().min(0).max(1e9).default(0),
  r: z.number().int().min(0).max(1e9).default(0),
  o: z.array(z.string().max(80)).max(400).default([]),
  n: z.array(z.string().max(32)).max(64).default([]),
  b: z.array(z.number().int().min(0).max(10)).max(10).default([]),
  g: GovernmentIdSchema.default("standard"),
});
export type GuestProgress = z.infer<typeof GuestSchema>;

export const EMPTY_GUEST: GuestProgress = {
  c: 0,
  r: 0,
  o: [],
  n: [],
  b: [],
  g: "standard",
};

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(
    Uint8Array.from(bin, (ch) => ch.charCodeAt(0)),
  );
}

export function encodeGuest(g: GuestProgress): string {
  return toBase64Url(JSON.stringify(g));
}

export function decodeGuest(value: string | undefined): GuestProgress {
  if (value === undefined || value === "") return { ...EMPTY_GUEST };
  try {
    const r = GuestSchema.safeParse(JSON.parse(fromBase64Url(value)));
    return r.success ? r.data : { ...EMPTY_GUEST };
  } catch {
    return { ...EMPTY_GUEST };
  }
}

export function guestProgression(g: GuestProgress): Progression {
  return { nodes: g.n, buffs: g.b, government: g.g };
}
