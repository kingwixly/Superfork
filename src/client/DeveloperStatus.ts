import {
  DEVELOPER_FLAG_CODE,
  DEVELOPER_FLAG_REF,
} from "@openfront/shared/DeveloperFlag";

/**
 * Superfork: whether this browser holds the join gate's admin session, i.e.
 * belongs to the site's developer. Only decides what the UI offers (the
 * developer-only flag); the server enforces it separately from the gate's
 * own header, so faking this does nothing.
 *
 * Asked once per page load. No gate (local dev) or any error means "no".
 */
let developer: Promise<boolean> | null = null;

export function isSiteDeveloper(): Promise<boolean> {
  developer ??= fetch("/__gate/status", {
    credentials: "same-origin",
    cache: "no-store",
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => (j as { admin?: unknown } | null)?.admin === true)
    .catch(() => false);
  return developer;
}

export const DEVELOPER_FLAG = {
  ref: DEVELOPER_FLAG_REF,
  code: DEVELOPER_FLAG_CODE,
  name: DEVELOPER_FLAG_CODE,
} as const;
