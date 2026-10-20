import {
  BUFF_IDS,
  buffCost,
  BUFFS,
  canUnlockNode,
  COINS_PER_RP,
  cosmeticPrice,
  Effects,
  GovernmentId,
  GOVERNMENTS,
  TREE,
  TREE_BRANCHES,
  TreeBranch,
  TreeNode,
  unlockedGovernments,
} from "@openfront/engine-api/game/Progression";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { bundledCosmetics } from "@openfront/shared/BundledCosmetics";
import { html, LitElement, nothing, render, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  buffLevels,
  buyCosmetic,
  buyResearch,
  chooseStartGovernment,
  coins,
  isAdmin,
  levelBuff,
  loadProgress,
  login,
  logout,
  myProgression,
  ownsFlare,
  PROGRESS_CHANGED,
  progressState,
  register,
  researchPoints,
  startGovernment,
  unlockedNodes,
  unlockNode,
} from "../Progress";
import { translateText } from "../Utils";

type Tab = "account" | "shop" | "research" | "governments" | "buffs";
const TABS: Tab[] = ["account", "shop", "research", "governments", "buffs"];

const EFFECT_ORDER: (keyof Effects)[] = [
  "gold",
  "troopGrowth",
  "maxTroops",
  "attackSpeed",
  "buildSpeed",
  "defense",
  "research",
];

function describe(e: Effects): string {
  const parts = EFFECT_ORDER.filter((k) => Math.abs(e[k] - 1) > 1e-6).map(
    (k) => {
      const pct = Math.round((e[k] - 1) * 100);
      return translateText(`progress.effect.${k}`, {
        pct: `${pct > 0 ? "+" : ""}${pct}%`,
      });
    },
  );
  return parts.length === 0
    ? translateText("progress.effect.none")
    : parts.join(", ");
}

/** A unit's translated name, falling back to its type string. */
function unitName(u: string): string {
  const key = `unit_type.${u.toLowerCase().replace(/ /g, "_")}`;
  const t = translateText(key);
  return t === key ? u : t;
}

function titleCase(id: string): string {
  return id
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** A tiny swatch of a pattern in a palette (decoded like PatternDecoder). */
function patternSwatch(data: string, primary: string, secondary: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 40;
  const g = c.getContext("2d");
  if (g === null) return c;
  let s = data.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const b = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
  const scale = b[1] & 7;
  const w = (((b[2] & 3) << 5) | ((b[1] >> 3) & 31)) + 2;
  const h = ((b[2] >> 2) & 63) + 2;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const px = (x >> scale) % w;
      const py = (y >> scale) % h;
      const i = py * w + px;
      g.fillStyle = b[3 + (i >> 3)] & (1 << (i & 7)) ? secondary : primary;
      g.fillRect(x * 2, y * 2, 2, 2);
    }
  }
  return c;
}

/**
 * Superfork: the coin badge in the name row and the hub it opens — account,
 * cosmetics shop, research tree, governments and research buffs.
 */
@customElement("superfront-hub")
export class SuperfrontHub extends LitElement {
  @state() private open = false;
  @state() private tab: Tab = "account";
  @state() private error: string | null = null;
  @state() private busy = false;
  @state() private rpAmount = 50;
  @state() private tick = 0;

  createRenderRoot() {
    return this;
  }

  private onChanged = () => this.tick++;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener(PROGRESS_CHANGED, this.onChanged);
    void loadProgress();
  }

  disconnectedCallback() {
    window.removeEventListener(PROGRESS_CHANGED, this.onChanged);
    this.portal?.remove();
    this.portal = null;
    super.disconnectedCallback();
  }

  /**
   * The modal renders into its own container on <body>: inside the name row
   * it sat in that row's stacking context, under the site header and footer.
   */
  private portal: HTMLDivElement | null = null;

  protected updated(): void {
    if (this.portal === null) {
      this.portal = document.createElement("div");
      this.portal.setAttribute("data-superfront-hub", "");
      document.body.appendChild(this.portal);
    }
    render(this.open ? this.renderModal() : nothing, this.portal);
  }

  private async act(fn: () => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      await fn();
    } catch (e) {
      const code = e instanceof Error ? e.message : "server_error";
      this.error = translateText(`progress.error.${code}`);
      if (this.error.startsWith("progress.error.")) {
        this.error = translateText("progress.error.server_error");
      }
    } finally {
      this.busy = false;
    }
  }

  // ---------------------------------------------------------------- badge --

  render() {
    return html`
      <button
        type="button"
        class="flex h-full max-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-bold text-amber-200 hover:bg-white/5 cursor-pointer"
        title=${translateText("progress.hub_title")}
        @click=${() => {
          this.open = true;
          void loadProgress(true);
        }}
      >
        <span aria-hidden="true">🪙</span>${coins()}
      </button>
    `;
  }

  private renderModal(): TemplateResult {
    return html`<div
      class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 p-3"
      @click=${() => (this.open = false)}
    >
      <div
        class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-white/15 bg-slate-900/95 text-white shadow-2xl"
        @click=${(e: Event) => e.stopPropagation()}
        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
      >
        <header class="flex items-center justify-between gap-2 p-4 pb-2">
          <div>
            <h2 class="text-lg font-bold">
              ${translateText("progress.hub_title")}
            </h2>
            <p class="text-sm text-slate-300">
              🪙 ${coins()} · 🔬 ${researchPoints()} RP
              ${isAdmin()
                ? html`·
                    <span class="text-amber-300"
                      >${translateText("progress.admin")}</span
                    >`
                : nothing}
            </p>
          </div>
          <button
            class="rounded-md bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
            @click=${() => (this.open = false)}
          >
            ✕
          </button>
        </header>
        <nav class="flex flex-wrap gap-1 px-4">
          ${TABS.map(
            (t) =>
              html`<button
                class="rounded-md px-3 py-1 text-sm ${t === this.tab
                  ? "bg-white/20"
                  : "bg-white/5 hover:bg-white/10"}"
                @click=${() => {
                  this.tab = t;
                  this.error = null;
                }}
              >
                ${translateText(`progress.tab.${t}`)}
              </button>`,
          )}
        </nav>
        ${this.error
          ? html`<p class="px-4 pt-2 text-sm text-red-400">${this.error}</p>`
          : nothing}
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          ${this.tab === "account"
            ? this.renderAccount()
            : this.tab === "shop"
              ? this.renderShop()
              : this.tab === "research"
                ? this.renderResearch()
                : this.tab === "governments"
                  ? this.renderGovernments()
                  : this.renderBuffs()}
        </div>
      </div>
    </div>`;
  }

  private btn(
    label: string,
    onClick: () => void,
    disabled = false,
    tone: "plain" | "good" = "plain",
  ) {
    return html`<button
      type="button"
      class="rounded-md px-3 py-1 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${tone ===
      "good"
        ? "bg-emerald-700 hover:bg-emerald-600"
        : "bg-slate-700 hover:bg-slate-600"}"
      ?disabled=${disabled || this.busy}
      @click=${onClick}
    >
      ${label}
    </button>`;
  }

  // -------------------------------------------------------------- account --

  private renderAccount(): TemplateResult {
    const profile = progressState().profile;
    const rpCost = this.rpAmount * COINS_PER_RP;
    const buyRp = html`<div class="mt-4 rounded-lg bg-white/5 p-3">
      <h3 class="mb-1 font-semibold">${translateText("progress.buy_rp")}</h3>
      <p class="mb-2 text-xs text-slate-300">
        ${translateText("progress.buy_rp_hint", { rate: COINS_PER_RP })}
      </p>
      <div class="flex items-center gap-2">
        <input
          type="number"
          min="1"
          class="w-24 rounded-md border border-slate-600 bg-slate-800 px-2 py-1"
          .value=${String(this.rpAmount)}
          @input=${(e: Event) =>
            (this.rpAmount = Math.max(
              1,
              Math.floor(Number((e.target as HTMLInputElement).value) || 1),
            ))}
        />
        ${this.btn(
          translateText("progress.buy_rp_button", { coins: rpCost }),
          () => void this.act(() => buyResearch(this.rpAmount)),
          coins() < rpCost,
          "good",
        )}
      </div>
    </div>`;

    if (profile !== null) {
      return html`<p>
          ${translateText("progress.signed_in_as", {
            name: profile.username,
          })}
        </p>
        <div class="mt-2">
          ${this.btn(translateText("progress.logout"), () =>
            this.act(() => logout()),
          )}
        </div>
        ${buyRp}
        <p class="mt-4 text-xs text-slate-400">
          ${translateText("progress.how_to_earn")}
        </p>`;
    }
    return html`<p class="mb-3 text-sm text-slate-300">
        ${translateText("progress.guest_note")}
      </p>
      <form
        class="flex flex-col gap-2"
        @submit=${(e: Event) => e.preventDefault()}
      >
        <input
          id="sf-username"
          autocomplete="username"
          placeholder=${translateText("progress.username")}
          class="rounded-md border border-slate-600 bg-slate-800 px-3 py-2"
        />
        <input
          id="sf-password"
          type="password"
          autocomplete="current-password"
          placeholder=${translateText("progress.password")}
          class="rounded-md border border-slate-600 bg-slate-800 px-3 py-2"
        />
        <div class="flex gap-2">
          ${this.btn(
            translateText("progress.login"),
            () => this.signIn(false),
            false,
            "good",
          )}
          ${this.btn(translateText("progress.register"), () =>
            this.signIn(true),
          )}
        </div>
        <p class="text-xs text-slate-400">
          ${translateText("progress.register_hint")}
        </p>
      </form>
      ${buyRp}
      <p class="mt-4 text-xs text-slate-400">
        ${translateText("progress.how_to_earn")}
      </p>`;
  }

  private signIn(create: boolean) {
    const root = this.portal ?? this;
    const u = root.querySelector<HTMLInputElement>("#sf-username")?.value ?? "";
    const p = root.querySelector<HTMLInputElement>("#sf-password")?.value ?? "";
    void this.act(() => (create ? register(u, p) : login(u, p)));
  }

  // ----------------------------------------------------------------- shop --

  private shopItem(
    flare: string,
    label: string,
    rarity: string,
    preview: TemplateResult | HTMLElement,
  ): TemplateResult {
    const owned = ownsFlare(flare);
    const price = cosmeticPrice(rarity);
    return html`<div
      class="flex flex-col items-center gap-1 rounded-lg bg-white/5 p-2 text-center"
    >
      <div class="flex h-12 items-center justify-center">${preview}</div>
      <div class="text-xs font-semibold leading-tight">${label}</div>
      <div class="text-[10px] uppercase tracking-wider text-slate-400">
        ${rarity}
      </div>
      ${owned
        ? html`<span class="text-xs text-emerald-300"
            >${translateText("progress.owned")}</span
          >`
        : this.btn(
            `🪙 ${price}`,
            () => void this.act(() => buyCosmetic(flare, price)),
            coins() < price,
            "good",
          )}
    </div>`;
  }

  private renderShop(): TemplateResult {
    const c = bundledCosmetics();
    const grid = (items: TemplateResult[]) =>
      html`<div class="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        ${items}
      </div>`;
    const heading = (key: string) =>
      html`<h3 class="mb-2 font-semibold">${translateText(key)}</h3>`;

    const patterns: TemplateResult[] = [];
    for (const p of Object.values(c.patterns)) {
      for (const pal of p.colorPalettes ?? []) {
        const palette = c.colorPalettes?.[pal.name];
        if (palette === undefined) continue;
        patterns.push(
          this.shopItem(
            `pattern:${p.name}:${pal.name}`,
            `${titleCase(p.name)} · ${titleCase(pal.name)}`,
            String(p.rarity),
            patternSwatch(
              p.pattern,
              palette.primaryColor,
              palette.secondaryColor,
            ),
          ),
        );
      }
    }
    const img = (url: string) =>
      html`<img
        src=${assetUrl(url.replace(/^\//, ""))}
        class="h-12 w-12 object-contain"
        loading="lazy"
      />`;
    const crowns = Object.values(c.crowns ?? {}).map((cr) =>
      this.shopItem(
        `crown:${cr.name}`,
        titleCase(cr.name),
        String(cr.rarity),
        img(cr.url),
      ),
    );
    const skins = Object.values(c.skins ?? {}).map((sk) =>
      this.shopItem(
        `skin:${sk.name}`,
        titleCase(sk.name),
        String(sk.rarity),
        html`<div class="rounded bg-sky-800/60 p-0.5">${img(sk.url)}</div>`,
      ),
    );
    const effects: TemplateResult[] = [];
    for (const [type, group] of Object.entries(c.effects ?? {})) {
      for (const e of Object.values(group ?? {})) {
        const colors = (e.attributes as { colors?: string[] }).colors ?? [];
        effects.push(
          this.shopItem(
            `effect:${e.name}`,
            `${titleCase(e.name)} (${translateText(`progress.effect_type.${type}`)})`,
            String(e.rarity),
            html`<div
              class="h-6 w-12 rounded"
              style="background:linear-gradient(90deg,${colors.join(",") ||
              "#888,#888"})"
            ></div>`,
          ),
        );
      }
    }
    return html`<p class="mb-3 text-xs text-slate-400">
        ${translateText("progress.shop_hint")}
      </p>
      ${heading("progress.shop.patterns")} ${grid(patterns)}
      ${heading("progress.shop.crowns")} ${grid(crowns)}
      ${heading("progress.shop.skins")} ${grid(skins)}
      ${heading("progress.shop.effects")} ${grid(effects)}`;
  }

  // ------------------------------------------------------------- research --

  private nodeCard(n: TreeNode): TemplateResult {
    const nodes = unlockedNodes();
    const unlocked = isAdmin() || nodes.includes(n.id);
    const available = canUnlockNode(n.id, nodes);
    const what = n.units ? n.units.map(unitName).join(", ") : "";
    const requires = n.requires
      .filter((r) => !nodes.includes(r))
      .map((r) => translateText(`progress.node.${r}`));
    return html`<div class="rounded-lg bg-white/5 p-2">
      <div class="flex items-center justify-between gap-2">
        <b class="text-sm">${translateText(`progress.node.${n.id}`)}</b>
        ${unlocked
          ? html`<span class="text-xs text-emerald-300"
              >${translateText("progress.unlocked")}</span
            >`
          : this.btn(
              `🔬 ${n.cost}`,
              () => void this.act(() => unlockNode(n.id)),
              !available || researchPoints() < n.cost,
              "good",
            )}
      </div>
      <div class="text-xs text-slate-300">${what}</div>
      ${n.government
        ? html`<div class="text-xs text-slate-400">
            ${describe(GOVERNMENTS[n.government].effects)}
          </div>`
        : nothing}
      ${!unlocked && requires.length > 0
        ? html`<div class="text-xs text-amber-300">
            ${translateText("progress.requires", {
              list: requires.join(", "),
            })}
          </div>`
        : nothing}
    </div>`;
  }

  private branch(b: TreeBranch): TemplateResult {
    return html`<h3 class="mb-2 mt-1 font-semibold">
        ${translateText(`progress.branch.${b}`)}
      </h3>
      <div class="mb-4 grid gap-2 sm:grid-cols-2">
        ${TREE.filter((n) => n.branch === b).map((n) => this.nodeCard(n))}
      </div>`;
  }

  private renderResearch(): TemplateResult {
    return html`<p class="mb-3 text-xs text-slate-400">
        ${translateText("progress.research_hint")}
      </p>
      ${TREE_BRANCHES.filter((b) => b !== "governments").map((b) =>
        this.branch(b),
      )}`;
  }

  // ---------------------------------------------------------- governments --

  private renderGovernments(): TemplateResult {
    const available = unlockedGovernments(myProgression());
    const start = startGovernment();
    return html`<p class="mb-3 text-xs text-slate-400">
        ${translateText("progress.governments_hint")}
      </p>
      <div class="mb-4 rounded-lg bg-white/5 p-3">
        <h3 class="mb-2 font-semibold">
          ${translateText("progress.start_government")}
        </h3>
        <div class="flex flex-wrap gap-2">
          ${available.map((id: GovernmentId) =>
            this.btn(
              translateText(`progress.government.${id}`),
              () => void this.act(() => chooseStartGovernment(id)),
              id === start,
              id === start ? "good" : "plain",
            ),
          )}
        </div>
        <p class="mt-2 text-xs text-slate-400">
          ${translateText("progress.government.standard")}:
          ${describe(GOVERNMENTS.standard.effects)}
        </p>
      </div>
      ${this.branch("governments")}`;
  }

  // ---------------------------------------------------------------- buffs --

  private renderBuffs(): TemplateResult {
    const levels = buffLevels();
    return html`<p class="mb-3 text-xs text-slate-400">
        ${translateText("progress.buffs_hint")}
      </p>
      <div class="grid gap-2 sm:grid-cols-2">
        ${BUFF_IDS.map((id, i) => {
          const level = levels[i] ?? 0;
          const max = BUFFS[id].maxLevel;
          const cost = buffCost(level);
          const pct = Math.round(BUFFS[id].perLevel * 100);
          return html`<div class="rounded-lg bg-white/5 p-2">
            <div class="flex items-center justify-between gap-2">
              <b class="text-sm">${translateText(`progress.buff.${id}`)}</b>
              <span class="text-xs text-slate-300"
                >${translateText("progress.level", { level, max })}</span
              >
            </div>
            <div class="mb-1 text-xs text-slate-400">
              ${translateText("progress.buff_per_level", { pct })}
            </div>
            ${level >= max
              ? html`<span class="text-xs text-emerald-300"
                  >${translateText("progress.maxed")}</span
                >`
              : this.btn(
                  `🔬 ${cost}`,
                  () => void this.act(() => levelBuff(id)),
                  !isAdmin() && researchPoints() < cost,
                  "good",
                )}
          </div>`;
        })}
      </div>`;
  }
}
