import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import Countries from "resources/countries.json" with { type: "json" };
import { DEVELOPER_FLAGS, isSiteDeveloper } from "../DeveloperStatus";
import {
  FLAG_KEY,
  USER_SETTINGS_CHANGED_EVENT,
  UserSettings,
} from "../UserSettings";
import { translateText } from "../Utils";

type FlagChoice = { ref: string; code: string; name: string; dev?: boolean };

const COUNTRY_CHOICES: FlagChoice[] = Countries.filter(
  (c) => c.code !== "xx" && c.restricted !== true,
).map((c) => ({ ref: `country:${c.code}`, code: c.code, name: c.name }));

const flagUrl = (code: string) => assetUrl(`/flags/${code}.svg`);

/**
 * Superfork: the flag button at the start of the play page's name row, the
 * way openfront.io used to have it. Picks from the free flags (countries plus
 * SuperFront's own; the developer flag too for the site admin) and writes the
 * same setting as the Inventory's Flags tab, so the two always agree.
 */
@customElement("flag-quick-picker")
export class FlagQuickPicker extends LitElement {
  @state() private open = false;
  @state() private flag: string | null = null;
  @state() private search = "";
  @state() private developer = false;

  private readonly settings = new UserSettings();

  createRenderRoot() {
    return this; // Tailwind
  }

  private onFlagChanged = () => {
    this.flag = this.settings.getFlag();
  };

  private onDocumentPointerDown = (e: Event) => {
    if (this.open && !e.composedPath().includes(this)) this.open = false;
  };

  connectedCallback() {
    super.connectedCallback();
    this.flag = this.settings.getFlag();
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${FLAG_KEY}`,
      this.onFlagChanged,
    );
    document.addEventListener("pointerdown", this.onDocumentPointerDown, {
      capture: true,
    });
    void isSiteDeveloper().then((dev) => (this.developer = dev));
  }

  disconnectedCallback() {
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:${FLAG_KEY}`,
      this.onFlagChanged,
    );
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, {
      capture: true,
    });
    super.disconnectedCallback();
  }

  private choices(): FlagChoice[] {
    const all = this.developer
      ? [
          ...DEVELOPER_FLAGS.map((f) => ({ ...f, dev: true })),
          ...COUNTRY_CHOICES,
        ]
      : COUNTRY_CHOICES;
    const q = this.search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }

  /** Code of the equipped flag, for its picture; null for none or a non-country flag. */
  private equippedCode(): string | null {
    if (this.flag === null || !this.flag.startsWith("country:")) return null;
    return this.flag.slice("country:".length);
  }

  private pick(ref: string | null) {
    if (ref === null) this.settings.clearFlag(true);
    else this.settings.setFlag(ref);
    this.flag = this.settings.getFlag();
    this.open = false;
    this.search = "";
  }

  private toggle = () => {
    this.open = !this.open;
    if (this.open) {
      void this.updateComplete.then(() =>
        this.querySelector<HTMLInputElement>("#flag-quick-search")?.focus(),
      );
    }
  };

  private onKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.open) return;
    this.open = false;
    this.querySelector<HTMLElement>("#flag-quick-button")?.focus();
  };

  render() {
    const code = this.equippedCode();
    const label = translateText("username.flag_label");
    return html`
      <div
        class="relative shrink-0 h-full max-h-[44px]"
        @keydown=${this.onKeydown}
      >
        <button
          type="button"
          id="flag-quick-button"
          class="flex h-full items-center gap-1 rounded-lg px-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-malibu-blue/60 ${this
            .open
            ? "bg-white/10"
            : "hover:bg-white/5"}"
          aria-haspopup="dialog"
          aria-expanded=${this.open ? "true" : "false"}
          aria-label=${label}
          title=${label}
          @click=${this.toggle}
        >
          ${code !== null
            ? html`<img
                src=${flagUrl(code)}
                alt=""
                class="h-8 w-8 object-contain"
                draggable="false"
              />`
            : html`<svg
                viewBox="0 0 24 24"
                class="h-6 w-6 text-white/45"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
              </svg>`}
          <svg
            viewBox="0 0 20 20"
            class="w-3 h-3 shrink-0 text-white/45"
            aria-hidden="true"
          >
            <path
              d="M5.5 7.5 10 12l4.5-4.5"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>
        </button>
        ${this.open ? this.renderMenu() : nothing}
      </div>
    `;
  }

  private renderMenu() {
    const choices = this.choices();
    return html`
      <div
        id="flag-quick-menu"
        role="dialog"
        aria-labelledby="flag-quick-button"
        class="absolute left-0 top-full z-50 mt-1.5 w-[20rem] max-w-[85vw] rounded-xl border border-white/15 bg-surface/95 p-2 shadow-xl backdrop-blur-md"
      >
        <div class="flex items-center gap-2 pb-2">
          <input
            id="flag-quick-search"
            type="text"
            autocomplete="off"
            class="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-malibu-blue/60"
            placeholder=${translateText("username.flag_search")}
            .value=${this.search}
            @input=${(e: Event) =>
              (this.search = (e.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            ?disabled=${this.flag === null}
            @click=${() => this.pick(null)}
          >
            ${translateText("username.flag_none")}
          </button>
        </div>
        <div
          class="grid max-h-72 grid-cols-5 gap-1 overflow-y-auto pr-0.5"
          role="listbox"
          aria-label=${translateText("username.flag_label")}
        >
          ${choices.map((c) => {
            const selected = c.ref === this.flag;
            return html`<button
              type="button"
              role="option"
              aria-selected=${selected ? "true" : "false"}
              title=${c.name}
              data-flag=${c.ref}
              class="relative flex aspect-square items-center justify-center rounded-lg p-0.5 transition-colors cursor-pointer ${selected
                ? "bg-malibu-blue/30 ring-2 ring-malibu-blue/70"
                : c.dev
                  ? "bg-amber-400/15 ring-1 ring-amber-300/60 hover:bg-amber-400/25"
                  : "hover:bg-white/10"}"
              @click=${() => this.pick(c.ref)}
            >
              <img
                src=${flagUrl(c.code)}
                alt=${c.name}
                loading="lazy"
                draggable="false"
                class="h-full w-full object-contain"
              />
            </button>`;
          })}
        </div>
        ${choices.length === 0
          ? html`<div class="px-2 py-3 text-center text-sm text-white/50">
              ${translateText("username.flag_no_results")}
            </div>`
          : nothing}
      </div>
    `;
  }
}
