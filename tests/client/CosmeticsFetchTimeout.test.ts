import { bundledCosmetics } from "@openfront/shared/BundledCosmetics";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserMe } from "../../src/client/Api";
import {
  COSMETICS_FETCH_TIMEOUT_MS,
  fetchCosmetics,
  invalidateCosmetics,
} from "../../src/client/Cosmetics";

vi.mock("../../src/client/Api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Api")>()),
  // Resolving the real API base needs the runtime config these tests don't
  // boot; the URL is not what is under test.
  getApiBase: () => "https://api.test",
  getUserMe: vi.fn(),
}));

// Minimal catalog: everything except patterns and flags is optional, and
// nothing here cares what is in it.
const catalog = { patterns: {}, flags: {} };

function okResponse() {
  return { ok: true, status: 200, json: async () => catalog };
}

// The rejection AbortSignal.timeout produces once the deadline passes. Raised
// here directly so the test does not have to burn ten real seconds proving
// what happens after it.
function abortError(): Error {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}

describe("fetchCosmetics is bounded", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invalidateCosmetics();
    vi.mocked(getUserMe).mockResolvedValue(false);
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    invalidateCosmetics();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // The defect this pins: the catalog request used to carry no signal at all,
  // so a connection that stalled rather than being refused (Steam offline
  // mode, a captive portal, a dead DNS server) never came back, and every
  // caller waiting on it — including the game-start path — waited forever.
  it("hands fetch a deadline-bound signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await fetchCosmetics();

    expect(timeoutSpy).toHaveBeenCalledWith(COSMETICS_FETCH_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.signal).toBe(timeoutSpy.mock.results[0].value);
  });

  it("bounds the catalog no later than the auth calls bound themselves", () => {
    // Auth.ts and Api.ts both use AbortSignal.timeout(10_000). A looser bound
    // here would put the slowest wait back on the game-start path.
    expect(COSMETICS_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(COSMETICS_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("falls back to the bundled catalog on the timeout rather than rejecting", async () => {
    fetchMock.mockRejectedValueOnce(abortError());

    // Superfork: with no catalog server, SuperFront's free bundled catalog is
    // used (the game server falls back to the same one). A rejection here
    // would propagate into the game-start path instead.
    await expect(fetchCosmetics()).resolves.toEqual(bundledCosmetics());
  });

  it("keeps the bundled catalog rather than waiting out the timeout again", async () => {
    fetchMock.mockRejectedValueOnce(abortError());

    expect(await fetchCosmetics()).toEqual(bundledCosmetics());
    // On SuperFront the server never answers; retrying would put a ten second
    // wait back on every later caller.
    expect(await fetchCosmetics()).toEqual(bundledCosmetics());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
