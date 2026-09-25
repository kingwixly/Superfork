import { describe, expect, test } from "vitest";
import {
  GAME_ROUTE,
  GAME_ROUTE_ALTERNATION,
  rewriteLegacyGameApi,
} from "../src/core/GameRoute";

describe("Match URL segment", () => {
  test("the emitted segment no longer contains 'game'", () => {
    // The reason for the rename: a network filter pattern-matches "/game".
    expect(`/${GAME_ROUTE}/`).not.toContain("/game");
  });

  test.each([
    ["/api/game/abc/exists", `/api/${GAME_ROUTE}/abc/exists`],
    ["/api/game/abc", `/api/${GAME_ROUTE}/abc`],
    ["/api/game/abc/listing", `/api/${GAME_ROUTE}/abc/listing`],
    ["/w0/api/game/abc/exists", `/w0/api/${GAME_ROUTE}/abc/exists`],
    ["/w12/api/game/abc", `/w12/api/${GAME_ROUTE}/abc`],
  ])("legacy %s is rewritten", (from, to) => {
    expect(rewriteLegacyGameApi(from)).toBe(to);
  });

  test.each([
    `/api/${GAME_ROUTE}/abc/exists`,
    "/api/create_game",
    "/api/adminbot/create_game",
    "/api/gamer/abc",
    "/api/games",
    "/game/abc",
  ])("%s is left alone", (path) => {
    // Only the /api/game/ SEGMENT is rewritten - not words that merely
    // contain 'game', and not the page route, which is handled separately.
    expect(rewriteLegacyGameApi(path)).toBe(path);
  });

  test("the page parser accepts both segments", () => {
    const re = new RegExp(`^/(?:w\\d+/)?${GAME_ROUTE_ALTERNATION}/([^/]+)`);
    expect("/w0/game/abc".match(re)?.[1]).toBe("abc");
    expect(`/w0/${GAME_ROUTE}/abc`.match(re)?.[1]).toBe("abc");
    expect("/w0/gamer/abc".match(re)).toBeNull();
  });
});
