/**
 * ProvinceController — provinces on the client:
 *
 *  - draws province borders and names over the map (toggleable, default on),
 *    with a star on each province's provincial capital (its biggest city);
 *  - the toolbar: Provinces panel, Draw provinces, border toggle;
 *  - the Provinces panel: your provinces (rename / administrative / trim /
 *    merge / liberate / disband), your puppets, and tribes you can ask to
 *    join;
 *  - the province panel for any province (right-click → Diplomacy →
 *    Province), with Attack province for an enemy's.
 *
 * Only active when the lobby turned provinces on. Plain DOM and a 2D
 * overlay, so none of it touches the WebGL renderer.
 */

import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  Cell,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { EventBus } from "@openfront/shared/EventBus";
import { Controller } from "../Controller";
import { showInGameConfirm } from "../InGameModal";
import { TransformHandler } from "../TransformHandler";
import {
  SendProvinceIntentEvent,
  SendPuppetLiberateIntentEvent,
} from "../Transport";
import { UIState } from "../UIState";
import { translateText } from "../Utils";
import { GameView, PlayerView } from "../view";
import type { ProvinceInfo } from "../view/ProvinceStore";
import { BeginStrokePaintEvent } from "./StrokePaintController";

const COLOR_MINE = "rgba(255,255,255,0.85)";
const COLOR_OTHER = "rgba(20,20,30,0.55)";
const COLOR_CONTESTED = "rgba(255,140,0,0.95)";
const COLOR_ADMIN = "rgba(255,215,0,0.95)";
const PROVINCE_BORDERS_KEY = "settings.provinceBorders";

/** Open the panel for one province (from the radial menu). */
export class OpenProvincePanelEvent {
  constructor(public readonly provinceId: number) {}
}

interface Segments {
  /** x1,y1,x2,y2 world coordinates per segment, grouped by colour. */
  byColor: Map<string, number[]>;
  labels: { name: string; x: number; y: number }[];
}

export class ProvinceController implements Controller {
  private overlay: HTMLCanvasElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private infoPanel: HTMLDivElement | null = null;
  private infoProvince = 0;
  private segments: Segments | null = null;
  private builtVersion = -1;
  private builtFor = -1;
  /** Provincial capitals: tile per province, refreshed every second. */
  private capitals: TileRef[] = [];
  private capitalsAt = 0;
  private panelSignature = "";
  private infoSignature = "";

  constructor(
    private eventBus: EventBus,
    private game: GameView,
    private transformHandler: TransformHandler,
    private uiState: UIState,
  ) {}

  init() {
    if (!this.game.config().provincesEnabled()) return;
    if (typeof document === "undefined") return;
    this.mountOverlay();
    this.mountToolbar();
    this.eventBus.on(OpenProvincePanelEvent, (e) =>
      this.openInfo(e.provinceId),
    );
  }

  tick() {
    if (this.panel !== null) this.renderPanel();
    if (this.infoPanel !== null) this.renderInfo();
  }

  private bordersOn(): boolean {
    try {
      return localStorage.getItem(PROVINCE_BORDERS_KEY) !== "false";
    } catch {
      return true;
    }
  }

  private toggleBorders() {
    try {
      localStorage.setItem(PROVINCE_BORDERS_KEY, String(!this.bordersOn()));
    } catch {
      // Private mode: stays on.
    }
  }

  // ---------------------------------------------------------------- borders

  private mountOverlay() {
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:3;";
    document.body.appendChild(c);
    this.overlay = c;
    requestAnimationFrame(this.draw);
  }

  private rebuild() {
    const store = this.game.provinceStore();
    const me = this.game.myPlayer()?.smallID() ?? -1;
    const w = this.game.width();
    const byColor = new Map<string, number[]>();
    const labels: Segments["labels"] = [];
    const push = (color: string, ...xy: number[]) => {
      let arr = byColor.get(color);
      if (arr === undefined) byColor.set(color, (arr = []));
      arr.push(...xy);
    };
    for (const p of store.all()) {
      const color =
        p.ownerID !== me
          ? COLOR_OTHER
          : p.held < p.size
            ? COLOR_CONTESTED
            : p.administrative
              ? COLOR_ADMIN
              : COLOR_MINE;
      let sx = 0;
      let sy = 0;
      for (const t of p.tiles) {
        const x = t % w;
        const y = (t - x) / w;
        sx += x;
        sy += y;
        // An edge is a border when the tile on the other side is in a
        // different province (or none).
        if (x === 0 || store.provinceOf[t - 1] !== p.id) {
          push(color, x, y, x, y + 1);
        }
        if (x === w - 1 || store.provinceOf[t + 1] !== p.id) {
          push(color, x + 1, y, x + 1, y + 1);
        }
        if (t < w || store.provinceOf[t - w] !== p.id) {
          push(color, x, y, x + 1, y);
        }
        if (
          t + w >= store.provinceOf.length ||
          store.provinceOf[t + w] !== p.id
        ) {
          push(color, x, y + 1, x + 1, y + 1);
        }
      }
      if (p.tiles.length > 0) {
        labels.push({
          name: p.name,
          x: sx / p.tiles.length + 0.5,
          y: sy / p.tiles.length + 0.5,
        });
      }
    }
    this.segments = { byColor, labels };
  }

  /** Each province's biggest city held by its owner is its provincial capital. */
  private refreshCapitals() {
    const store = this.game.provinceStore();
    const best = new Map<number, { tile: TileRef; level: number }>();
    for (const city of this.game.units(UnitType.City)) {
      const tile = city.tile();
      const p = store.at(tile);
      if (p === undefined || city.owner().smallID() !== p.ownerID) continue;
      const cur = best.get(p.id);
      if (cur === undefined || city.level() > cur.level) {
        best.set(p.id, { tile, level: city.level() });
      }
    }
    this.capitals = [...best.values()].map((b) => b.tile);
  }

  private draw = () => {
    const c = this.overlay;
    if (c === null) return;
    requestAnimationFrame(this.draw);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, W, H);

    const store = this.game.provinceStore();
    const me = this.game.myPlayer()?.smallID() ?? -1;
    if (store.version !== this.builtVersion || me !== this.builtFor) {
      this.rebuild();
      this.builtVersion = store.version;
      this.builtFor = me;
    }
    const now = performance.now();
    if (now - this.capitalsAt > 1000) {
      this.refreshCapitals();
      this.capitalsAt = now;
    }

    const showBorders =
      this.bordersOn() || this.uiState.strokePainting === true;
    if (!showBorders || this.segments === null) return;

    const o = this.transformHandler.worldToScreenCoordinates(new Cell(0, 0));
    const one = this.transformHandler.worldToScreenCoordinates(new Cell(1, 0));
    const s = one.x - o.x;
    const width = Math.max(1, Math.min(2.5, s * 0.25));
    for (const [color, xy] of this.segments.byColor) {
      ctx.beginPath();
      for (let i = 0; i < xy.length; i += 4) {
        ctx.moveTo(o.x + xy[i] * s, o.y + xy[i + 1] * s);
        ctx.lineTo(o.x + xy[i + 2] * s, o.y + xy[i + 3] * s);
      }
      // Dark casing under the colour so borders read on light and dark
      // territory alike.
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = width + 2;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    // Provincial capitals: a small gold star over the city.
    if (s >= 0.8) {
      const r = Math.max(4, Math.min(9, s * 1.4));
      for (const t of this.capitals) {
        const x = o.x + (this.game.x(t) + 0.5) * s;
        const y = o.y + (this.game.y(t) + 0.5) * s - r * 1.6;
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        star(ctx, x, y, r);
      }
    }

    // Names once zoomed in far enough to read them.
    if (s >= 1.2) {
      ctx.font = `600 ${Math.min(18, 8 + s * 2)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      for (const l of this.segments.labels) {
        const x = o.x + l.x * s;
        const y = o.y + l.y * s;
        if (x < -100 || y < -20 || x > W + 100 || y > H + 20) continue;
        ctx.strokeText(l.name, x, y);
        ctx.fillText(l.name, x, y);
      }
    }
  };

  // ---------------------------------------------------------------- toolbar

  private mountToolbar() {
    const bar = document.createElement("div");
    bar.setAttribute("data-province-toolbar", "");
    bar.style.cssText =
      "position:fixed;left:12px;bottom:200px;z-index:50;display:flex;flex-direction:column;gap:6px;";
    bar.append(
      this.toolbarButton(translateText("provinces.panel_button"), () =>
        this.togglePanel(),
      ),
      this.toolbarButton(translateText("provinces.draw_button"), () =>
        this.startDrawing(),
      ),
      this.toolbarButton(translateText("provinces.borders_button"), () =>
        this.toggleBorders(),
      ),
    );
    document.body.appendChild(bar);
    this.toolbar = bar;
  }

  private toolbarButton(label: string, onClick: () => void) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "background:rgba(15,23,42,.9);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 10px;font:600 12px system-ui,sans-serif;cursor:pointer;";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private startDrawing() {
    if (this.game.myPlayer()?.isAlive() !== true) return;
    this.eventBus.emit(
      new BeginStrokePaintEvent({
        title: translateText("provinces.draw_title"),
        hint: (count) => translateText("provinces.draw_hint", { count }),
        confirmLabel: translateText("provinces.confirm"),
        onConfirm: (points, breaks) =>
          this.send({ action: "draw", points, breaks }),
      }),
    );
  }

  private send(
    intent: ConstructorParameters<typeof SendProvinceIntentEvent>[0],
  ) {
    this.eventBus.emit(new SendProvinceIntentEvent(intent));
  }

  // ---------------------------------------------------------- your panel

  private togglePanel() {
    if (this.panel !== null) {
      this.panel.remove();
      this.panel = null;
      return;
    }
    this.panel = this.mountPanel("data-province-panel", "300px");
    this.panelSignature = "";
    this.renderPanel();
  }

  private mountPanel(attr: string, bottom: string): HTMLDivElement {
    const p = document.createElement("div");
    p.setAttribute(attr, "");
    p.style.cssText =
      `position:fixed;left:12px;bottom:${bottom};z-index:60;width:min(360px,calc(100vw - 24px));` +
      "max-height:50vh;overflow:auto;background:rgba(15,23,42,.94);color:#fff;" +
      "border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px;font:13px system-ui,sans-serif;";
    p.addEventListener("pointerdown", (e) => e.stopPropagation());
    document.body.appendChild(p);
    return p;
  }

  private renderPanel() {
    const panel = this.panel;
    if (panel === null) return;
    const me = this.game.myPlayer();
    const store = this.game.provinceStore();
    const mine = me === null ? [] : store.ownedBy(me.smallID());
    const puppets =
      me === null
        ? []
        : store
            .puppetsOf(me.smallID())
            .map((id) => this.game.playerBySmallID(id))
            .filter((p): p is PlayerView => p.isPlayer());
    const tribes = this.nearbyTribes();
    // Rebuild only on change, so typing into a rename box isn't wiped.
    const sig = JSON.stringify([
      mine.map((p) => [p.id, p.name, p.size, p.held, p.administrative]),
      puppets.map((p) => p.id()),
      tribes.map((t) => t.id()),
    ]);
    if (sig === this.panelSignature) return;
    this.panelSignature = sig;

    panel.textContent = "";
    panel.appendChild(this.heading(translateText("provinces.panel_title")));
    if (mine.length === 0) {
      panel.appendChild(this.note(translateText("provinces.none_yet")));
    }
    for (const p of mine) panel.appendChild(this.provinceRow(p, mine));

    if (puppets.length > 0) {
      panel.appendChild(this.heading(translateText("provinces.puppets_title")));
      for (const pup of puppets) {
        const row = this.row();
        const name = document.createElement("span");
        name.textContent = translateText("provinces.puppet_row", {
          name: pup.displayName(),
          tiles: pup.numTilesOwned(),
        });
        row.appendChild(name);
        panel.appendChild(row);
      }
    }

    if (tribes.length > 0) {
      panel.appendChild(this.heading(translateText("provinces.tribes_title")));
      panel.appendChild(this.note(translateText("provinces.tribes_hint")));
      for (const tribe of tribes) {
        const row = this.row();
        const name = document.createElement("span");
        name.style.flex = "1";
        name.textContent = tribe.displayName();
        row.append(
          name,
          this.small(translateText("provinces.integrate"), () =>
            this.send({ action: "integrate", targetID: tribe.id() }),
          ),
        );
        panel.appendChild(row);
      }
    }
  }

  /** Living tribes that share a border with me. */
  private nearbyTribes(): PlayerView[] {
    const me = this.game.myPlayer();
    if (me === null || !me.isAlive()) return [];
    const mine = me.smallID();
    const w = this.game.width();
    const found = new Set<number>();
    // Sample my border: tribes touching it.
    const tribes = this.game
      .players()
      .filter((p) => p.type() === PlayerType.Bot && p.isAlive());
    if (tribes.length === 0) return [];
    const tribeIDs = new Set(tribes.map((t) => t.smallID()));
    const owner = (t: number) => this.game.ownerID(t);
    const total = this.game.width() * this.game.height();
    // A full scan is fine: the panel only re-reads this once per tick while
    // open, and ownerID is a typed-array read.
    for (let t = 0; t < total; t++) {
      if (owner(t) !== mine) continue;
      const x = t % w;
      const n = [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t - w, t + w];
      for (const nb of n) {
        if (nb < 0 || nb >= total) continue;
        const o = owner(nb);
        if (tribeIDs.has(o)) found.add(o);
      }
    }
    return tribes.filter((t) => found.has(t.smallID()));
  }

  private provinceRow(p: ProvinceInfo, mine: ProvinceInfo[]): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText =
      "border-top:1px solid rgba(255,255,255,.12);padding:8px 0;display:flex;flex-direction:column;gap:6px;";
    row.appendChild(this.provinceHead(p));

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
    const input = document.createElement("input");
    input.value = p.name;
    input.maxLength = 32;
    input.style.cssText =
      "flex:1;min-width:120px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:3px 6px;";
    input.addEventListener("keydown", (e) => e.stopPropagation());
    actions.append(
      input,
      this.small(translateText("provinces.rename"), () =>
        this.send({ action: "rename", provinceId: p.id, name: input.value }),
      ),
    );
    if (!p.administrative) {
      actions.append(
        this.small(translateText("provinces.make_admin"), () =>
          this.send({ action: "admin", provinceId: p.id }),
        ),
      );
    }
    if (p.held < p.size) {
      actions.append(
        this.small(translateText("provinces.trim"), () =>
          this.send({ action: "trim", provinceId: p.id }),
        ),
      );
    }
    const others = mine.filter((o) => o.id !== p.id);
    if (others.length > 0) {
      const sel = document.createElement("select");
      sel.style.cssText =
        "background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:6px;";
      for (const o of others) {
        const opt = document.createElement("option");
        opt.value = String(o.id);
        opt.textContent = o.name;
        sel.appendChild(opt);
      }
      actions.append(
        sel,
        this.small(translateText("provinces.merge"), () =>
          this.send({
            action: "merge",
            provinceId: p.id,
            otherId: Number(sel.value),
          }),
        ),
      );
    }
    actions.append(
      this.small(translateText("provinces.liberate"), () => {
        void showInGameConfirm(
          translateText("provinces.confirm_liberate", { name: p.name }),
          { variant: "warning" },
        ).then((ok) => {
          if (ok) this.send({ action: "liberate", provinceId: p.id });
        });
      }),
      this.small(translateText("provinces.disband"), () =>
        this.send({ action: "disband", provinceId: p.id }),
      ),
    );
    row.appendChild(actions);
    return row;
  }

  private provinceHead(p: ProvinceInfo): HTMLElement {
    const head = document.createElement("div");
    const name = document.createElement("b");
    name.textContent = p.name;
    const meta = document.createElement("span");
    meta.style.cssText = "opacity:.75;margin-left:6px;font-size:12px;";
    const contested = p.held < p.size;
    meta.textContent = [
      translateText("provinces.tiles", { count: p.size }),
      p.administrative ? translateText("provinces.administrative") : "",
      contested
        ? translateText("provinces.contested", {
            pct: Math.round((100 * (p.size - p.held)) / Math.max(1, p.size)),
          })
        : "",
    ]
      .filter((s) => s.length > 0)
      .join(" · ");
    head.append(name, meta);
    return head;
  }

  // ------------------------------------------------------ province panel

  private openInfo(id: number) {
    this.infoPanel?.remove();
    this.infoProvince = id;
    this.infoPanel = this.mountPanel("data-province-info", "200px");
    this.infoPanel.style.left = "auto";
    this.infoPanel.style.right = "12px";
    this.infoSignature = "";
    this.renderInfo();
  }

  private closeInfo() {
    this.infoPanel?.remove();
    this.infoPanel = null;
  }

  private renderInfo() {
    const panel = this.infoPanel;
    if (panel === null) return;
    const p = this.game.provinceStore().get(this.infoProvince);
    const me = this.game.myPlayer();
    const sig = JSON.stringify(p ?? null);
    if (sig === this.infoSignature) return;
    this.infoSignature = sig;
    panel.textContent = "";
    const close = this.small("✕", () => this.closeInfo());
    close.style.float = "right";
    panel.appendChild(close);
    if (p === undefined) {
      panel.appendChild(this.note(translateText("provinces.gone")));
      return;
    }
    panel.appendChild(this.provinceHead(p));
    const owner = this.game.playerBySmallID(p.ownerID);
    const founder = this.game.playerBySmallID(p.founderID);
    const lines = [
      translateText("provinces.held_by", {
        name: owner.isPlayer() ? (owner as PlayerView).displayName() : "—",
      }),
    ];
    if (p.founderID !== p.ownerID && founder.isPlayer()) {
      lines.push(
        translateText("provinces.founded_by", {
          name: (founder as PlayerView).displayName(),
        }),
      );
    }
    for (const l of lines) panel.appendChild(this.note(l));

    if (me === null || !me.isAlive()) return;
    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;";
    if (p.ownerID !== me.smallID()) {
      actions.append(
        this.small(translateText("provinces.attack"), () => {
          this.send({
            action: "attack",
            provinceId: p.id,
            troops: me.troops() * this.uiState.attackRatio,
          });
        }),
      );
      const masterOfOwner = this.game.provinceStore().masterOf(p.ownerID);
      if (masterOfOwner !== 0 && masterOfOwner !== me.smallID()) {
        actions.append(
          this.small(translateText("provinces.free_puppet"), () => {
            if (owner.isPlayer()) {
              this.eventBus.emit(
                new SendPuppetLiberateIntentEvent((owner as PlayerView).id()),
              );
            }
          }),
        );
      }
    } else {
      actions.append(
        this.small(translateText("provinces.liberate"), () => {
          void showInGameConfirm(
            translateText("provinces.confirm_liberate", { name: p.name }),
            { variant: "warning" },
          ).then((ok) => {
            if (ok) this.send({ action: "liberate", provinceId: p.id });
          });
        }),
      );
    }
    panel.appendChild(actions);
  }

  // ---------------------------------------------------------------- bits

  private heading(text: string) {
    const h = document.createElement("div");
    h.style.cssText = "font-weight:700;margin:6px 0;";
    h.textContent = text;
    return h;
  }

  private note(text: string) {
    const n = document.createElement("div");
    n.style.cssText = "opacity:.75;font-size:12px;";
    n.textContent = text;
    return n;
  }

  private row() {
    const r = document.createElement("div");
    r.style.cssText =
      "display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid rgba(255,255,255,.08);";
    return r;
  }

  private small(label: string, onClick: () => void) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + rr * Math.cos(a);
    const py = y + rr * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#facc15";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
}
