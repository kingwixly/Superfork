import { afterEach, describe, expect, it, vi } from "vitest";
import "../../src/client/InventoryModal";
import type { InventoryModal } from "../../src/client/InventoryModal";

vi.mock("../../src/client/Auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Auth")>()),
  userAuth: vi.fn(async () => false),
}));

vi.mock("../../src/client/Api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Api")>()),
  getApiBase: vi.fn(() => "/api"),
}));

describe("Inventory catalog retry", () => {
  let modal: InventoryModal | undefined;

  Element.prototype.animate ??= () => ({ cancel: () => {} }) as Animation;

  afterEach(() => {
    modal?.remove();
    modal = undefined;
    vi.unstubAllGlobals();
  });

  it("still opens with the free flags when the catalog fails, and re-requests it next time", async () => {
    // Superfork: a self-hosted server has no cosmetics API, so a failed
    // catalog must not hide the inventory (and every country flag with it).
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ patterns: {}, flags: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    modal = document.createElement("inventory-modal") as InventoryModal;
    modal.setAttribute("inline", "");
    document.body.appendChild(modal);
    modal.open();

    await vi.waitFor(() =>
      expect(modal!.querySelector("inventory-loadout-bar")).toBeTruthy(),
    );
    expect(modal.querySelector('[data-inventory-state="error"]')).toBeNull();

    modal.open();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
