/**
 * URL path segment for match pages and match API routes.
 *
 * Was "game". Changed at the request of the network this is played on, whose
 * filter pattern-matches "/game" in URLs and was going to start blocking
 * those requests - which would have broken joining any match, not just the
 * shareable link, since the browser also calls /api/game/... to join.
 *
 * Every URL the client BUILDS uses this. The server and the client's path
 * parsers ACCEPT both this and the legacy "game", so links shared before the
 * change still resolve for anyone not behind that filter.
 *
 * To use "/match" instead, change this one value.
 */
export const GAME_ROUTE = "g";

/** Legacy segment, accepted on the way in, never emitted. */
export const LEGACY_GAME_ROUTE = "game";

/** Both segments, for routes and parsers that must accept either. */
export const GAME_ROUTE_ALTERNATION = `(?:${GAME_ROUTE}|${LEGACY_GAME_ROUTE})`;

/**
 * Rewrite a legacy match API path to the current segment, leaving every other
 * path untouched. Accepts the path with or without a /wN worker prefix.
 *
 * Exported so the Worker and its test share ONE implementation - a regex
 * rebuilt in a test can pass while the real one is wrong.
 */
const LEGACY_API = new RegExp(`^((?:/w\\d+)?/api/)${LEGACY_GAME_ROUTE}/`);
export function rewriteLegacyGameApi(url: string): string {
  return url.replace(LEGACY_API, `$1${GAME_ROUTE}/`);
}
