import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import { createGameWireContext } from "../../src/core/ZbinWire";
import {
  hashUciPassword,
  resetUciAuthForTests,
  UciAuth,
} from "../../src/server/UciAuth";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

const TURN_MS = 100;

describe("UCI through the game server", () => {
  let token: string;

  beforeEach(async () => {
    vi.useRealTimers();
    const hash = await hashUciPassword("Server-Test-1");
    process.env.UCI_PASSWORD_HASH = hash;
    resetUciAuthForTests();
    token = new UciAuth(hash).mintToken();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete process.env.UCI_PASSWORD_HASH;
    resetUciAuthForTests();
  });

  function setup() {
    const HOST = cid("host");
    const ADMIN = cid("admin");
    const game = makeGame({
      creatorPersistentID: "host-pid",
      config: { gameType: GameType.Private, maxPlayers: 3 },
    });
    const host = makeClient({ clientID: HOST, persistentID: "host-pid" });
    const admin = makeClient({ clientID: ADMIN, persistentID: "admin-pid" });
    game.joinClient(host);
    game.joinClient(admin);
    startGame(game);
    const ctx = createGameWireContext([
      { clientID: HOST },
      { clientID: ADMIN },
    ]);
    // Every uci intent the host has been sent in a turn.
    const relayed = () =>
      mockWsOf(host)
        .sent(ctx)
        .flatMap((m) => (m.type === "turn" ? m.turn.intents : []))
        .filter((i) => i.type === "uci");
    return { game, host, admin, relayed };
  }

  it("drops uci intents from a connection that has not proven the password", async () => {
    const { admin, relayed } = setup();
    await mockWsOf(admin).emit({
      type: "intent",
      intent: { type: "uci", action: "gold", enabled: true },
    });
    vi.advanceTimersByTime(TURN_MS * 2);
    expect(relayed()).toHaveLength(0);
    expect(admin.uciAdmin).toBe(false);
  });

  it("refuses a forged token", async () => {
    const { admin, relayed } = setup();
    await mockWsOf(admin).emit({ type: "uci_auth", token: "123.forged" });
    await mockWsOf(admin).emit({
      type: "intent",
      intent: { type: "uci", action: "gold", enabled: true },
    });
    vi.advanceTimersByTime(TURN_MS * 2);
    expect(relayed()).toHaveLength(0);
  });

  it("relays them once the token is proven, and never relays the token", async () => {
    const { host, admin, relayed } = setup();
    await mockWsOf(admin).emit({ type: "uci_auth", token });
    expect(admin.uciAdmin).toBe(true);
    await mockWsOf(admin).emit({
      type: "intent",
      intent: { type: "uci", action: "announce", text: "hi all" },
    });
    vi.advanceTimersByTime(TURN_MS * 2);
    expect(relayed()).toHaveLength(1);
    // The raw frames the host received never carry the token.
    for (const [frame] of mockWsOf(host).send.mock.calls) {
      expect(Buffer.from(frame as Uint8Array).includes(token)).toBe(false);
    }
  });

  it("transfer host moves the server's host to the chosen player", async () => {
    const { game, admin } = setup();
    await mockWsOf(admin).emit({ type: "uci_auth", token });
    expect(game.isCreator("admin-pid")).toBe(false);
    await mockWsOf(admin).emit({
      type: "intent",
      intent: {
        type: "uci",
        action: "transfer_host",
        targetClientID: admin.clientID,
      },
    });
    expect(game.isCreator("admin-pid")).toBe(true);
    expect(game.isCreator("host-pid")).toBe(false);
  });
});
