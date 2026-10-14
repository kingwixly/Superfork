import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/client/SteamSDK", () => ({
  steamSDK: { isOnSteam: () => false },
}));
vi.mock("../../../src/client/Utils", () => ({
  translateText: (key: string) => key,
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

import "../../../src/client/components/SteamWishlist";
import type { SteamWishlist } from "../../../src/client/components/SteamWishlist";

describe("steam-wishlist", () => {
  // Superfork strips third-party embeds (Phase 32): no Steam iframe at all.
  it("renders no Steam iframe", async () => {
    const el = document.createElement("steam-wishlist") as SteamWishlist;
    el.campaign = "test";
    document.body.appendChild(el);
    try {
      await el.updateComplete;
      const iframe = el.querySelector("iframe");
      expect(iframe).toBeNull();
    } finally {
      el.remove();
    }
  });
});
