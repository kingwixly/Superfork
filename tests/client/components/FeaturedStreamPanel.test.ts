import { afterEach, describe, expect, it, vi } from "vitest";

// Superfork strips third-party embeds: the <featured-stream> panel must never poll the
// streams feed, load the Twitch SDK, or render a card, even when someone is live.
const getStreams = vi.fn();
vi.mock("../../../src/client/Api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/client/Api")>()),
  getStreams: () => getStreams(),
}));

describe("featured-stream panel (disabled)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("never polls, injects a script, or renders a card", async () => {
    getStreams.mockResolvedValue({
      verifiedAt: new Date().toISOString(),
      featured: [
        {
          platform: "twitch",
          channel: "openfront",
          displayName: "openfront",
          viewers: 10,
          url: "https://twitch.tv/openfront",
          startedAt: "2026-08-03T12:00:00Z",
        },
      ],
      live: [],
    });
    await import("../../../src/client/FeaturedStream");
    const el = document.createElement("featured-stream") as HTMLElement & {
      updateComplete: Promise<boolean>;
    };
    document.body.appendChild(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 20));
    await el.updateComplete;
    expect(getStreams).not.toHaveBeenCalled();
    expect(document.querySelector("script[src*='twitch']")).toBeNull();
    expect(document.querySelector("#featured-stream-card")).toBeNull();
  });
});
