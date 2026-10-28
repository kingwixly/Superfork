import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
  copyToClipboard: vi.fn(),
  showToast: vi.fn(),
}));

import { NavAccountMenu } from "../../src/client/components/NavAccountMenu";
import { initNavigation } from "../../src/client/Navigation";
import { OPEN_ACCOUNT } from "../../src/client/Progress";

// Superfork: accounts are SuperFront's own. Every way to the old OpenFront
// account page (Discord / Google / Steam / email login) opens the SuperFront
// account panel instead.
describe("SuperFront account route", () => {
  const opened = vi.fn();

  beforeAll(() => {
    initNavigation();
    window.addEventListener(OPEN_ACCOUNT, opened);
  });

  afterEach(() => {
    opened.mockClear();
    document.body.innerHTML = "";
  });

  it("showPage('page-account') opens the SuperFront panel, not the old page", () => {
    const old = document.createElement("div");
    old.id = "page-account";
    old.className = "hidden page-content";
    document.body.appendChild(old);

    window.showPage?.("page-account");

    expect(opened).toHaveBeenCalledTimes(1);
    expect(old.classList.contains("hidden")).toBe(true);
  });

  it("the nav account button opens the SuperFront panel", async () => {
    if (!customElements.get("nav-account-menu")) {
      customElements.define("nav-account-menu", NavAccountMenu);
    }
    const el = document.createElement("nav-account-menu") as NavAccountMenu;
    document.body.appendChild(el);
    await el.updateComplete;

    el.querySelector<HTMLButtonElement>("[data-account-trigger]")!.click();
    await el.updateComplete;

    expect(opened).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
