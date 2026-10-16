/**
 * Superfork: the developer-only flag.
 *
 * Only the site admin can wear it. "Admin" means logged in to the join gate
 * with the admin code: the gate's /__gate/check answers with
 * `X-SF-Developer: 1` for an admin session, and nginx copies that onto every
 * request it proxies to the game workers (overwriting anything the browser
 * sent). The worker turns it into the DEVELOPER_FLARE, and Privilege only
 * accepts DEVELOPER_FLAG_REF from a player holding that flare.
 *
 * It is deliberately not in resources/countries.json, so it never shows up
 * in anyone else's flag list.
 */
export const DEVELOPER_FLAG_CODE = "SuperFront Developer";
export const DEVELOPER_FLAG_REF = `country:${DEVELOPER_FLAG_CODE}`;
/** Every admin-only flag (all are files in resources/flags, none in countries.json). */
export const DEVELOPER_FLAG_CODES: readonly string[] = [
  DEVELOPER_FLAG_CODE,
  "Michael Jackson",
];
export const isDeveloperFlagCode = (code: string) =>
  DEVELOPER_FLAG_CODES.includes(code);
export const isDeveloperFlagRef = (ref: string | undefined) =>
  ref !== undefined &&
  ref.startsWith("country:") &&
  isDeveloperFlagCode(ref.slice("country:".length));
export const DEVELOPER_FLARE = "superfront:developer";
/** Header nginx sets on proxied worker requests ("1" for the admin). */
export const DEVELOPER_HEADER = "x-sf-developer";
