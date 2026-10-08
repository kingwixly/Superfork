import { describe, expect, it } from "vitest";
import { Intent } from "../../src/core/Schemas";
import {
  authorizeIntent,
  IntentActor,
} from "../../src/server/IntentAuthorization";
import {
  hashUciPassword,
  UCI_MAX_FAILURES,
  UCI_TOKEN_TTL_MS,
  UciAuth,
} from "../../src/server/UciAuth";
import { cid } from "../util/GameServerHarness";

const PASSWORD = "Correct-Horse-42";

describe("UciAuth", () => {
  it("accepts the right password with a token, and nothing else", async () => {
    const auth = new UciAuth(await hashUciPassword(PASSWORD));
    const token = await auth.verifyPassword(PASSWORD, "1.1.1.1");
    expect(token).not.toBeNull();
    expect(auth.verifyToken(token)).toBe(true);
    expect(await auth.verifyPassword("wrong", "1.1.1.1")).toBeNull();
    expect(await auth.verifyPassword(undefined, "1.1.1.1")).toBeNull();
  });

  it("rejects forged, tampered and expired tokens", async () => {
    let now = 1_000_000;
    const hash = await hashUciPassword(PASSWORD);
    const auth = new UciAuth(hash, () => now);
    const token = auth.mintToken();
    expect(auth.verifyToken(token.slice(0, -2) + "xx")).toBe(false);
    expect(auth.verifyToken(`${now + UCI_TOKEN_TTL_MS + 5}.abc`)).toBe(false);
    expect(auth.verifyToken("garbage")).toBe(false);
    // A token from a server with a different password is useless here.
    const other = new UciAuth(await hashUciPassword("Another-1"), () => now);
    expect(auth.verifyToken(other.mintToken())).toBe(false);
    now += UCI_TOKEN_TTL_MS + 1;
    expect(auth.verifyToken(token)).toBe(false);
  });

  it("locks an IP out after repeated wrong guesses", async () => {
    const auth = new UciAuth(await hashUciPassword(PASSWORD));
    for (let i = 0; i < UCI_MAX_FAILURES; i++) {
      await auth.verifyPassword("nope", "2.2.2.2");
    }
    expect(auth.isLockedOut("2.2.2.2")).toBe(true);
    // Even the right password is refused while locked out.
    expect(await auth.verifyPassword(PASSWORD, "2.2.2.2")).toBeNull();
    expect(auth.isLockedOut("3.3.3.3")).toBe(false);
  });

  it("is off without UCI_PASSWORD_HASH", () => {
    expect(UciAuth.fromEnv({})).toBeNull();
    expect(UciAuth.fromEnv({ UCI_PASSWORD_HASH: "nonsense" })).toBeNull();
  });
});

describe("UCI intent authorization", () => {
  const actor = (over: Partial<IntentActor> = {}): IntentActor => ({
    clientID: cid("p1"),
    isLobbyCreator: false,
    isAdmin: false,
    isAdminBot: false,
    ...over,
  });
  const started = { isPublic: true, isListed: true, hasStarted: true };
  const uci: Intent = { type: "uci", action: "gold", enabled: true };

  it("relays uci intents only from a proven UCI admin", () => {
    expect(authorizeIntent(uci, actor(), started)?.status).toBe(403);
    expect(
      authorizeIntent(uci, actor({ isLobbyCreator: true }), started)?.status,
    ).toBe(403);
    expect(authorizeIntent(uci, actor({ isUciAdmin: true }), started)).toBe(
      null,
    );
  });

  it("lets a UCI admin kick and pause in any game", () => {
    const kick: Intent = { type: "kick_player", targetClientID: cid("p2") };
    const pause: Intent = { type: "toggle_pause", paused: true };
    const u = actor({ isUciAdmin: true });
    expect(authorizeIntent(kick, u, started)).toBe(null);
    expect(authorizeIntent(pause, u, started)).toBe(null);
    expect(authorizeIntent(kick, actor(), started)?.status).toBe(403);
  });
});
