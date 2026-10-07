/**
 * ProvinceController — everything provinces on the client:
 *
 *  - draws province borders and names over the map (toggleable, default on);
 *  - the border-painting tool: drag across your land, confirm, and every
 *    area your lines close off becomes a province;
 *  - the Provinces panel: your provinces with rename / administrative /
 *    trim / merge / disband.
 *
 * Only active when the lobby turned provinces on. Overlay and panel are plain
 * DOM so they don't touch the WebGL renderer.
 */

import { EventBus } from "../../core/EventBus";
import { Cell } from "../../core/game/Game";
import { TileRef } from "../../core/game/GameMap";
import { UserSettings } from "../../core/game/UserSettings";
import { MAX_PROVINCE_POINTS } from "../../core/Schemas";
import { Controller } from "../Controller";
import { ProvinceStrokeEvent } from "../InputHandler";
import { TransformHandler } from "../TransformHandler";
import { SendProvinceIntentEvent } from "../Transport";
import { UIState } from "../UIState";
import { translateText } from "../Utils";
import { GameView } from "../view";
import type { ProvinceInfo } from "../view/ProvinceStore";

const COLOR_MINE = "rgba(255,255,255,0.85)";
const COLOR_OTHER = "rgba(20,20,30,0.55)";
const COLOR_CONTESTED = "rgba(255,140,0,0.95)";
const COLOR_ADMIN = "rgba(255,215,0,0.95)";
const COLOR_STROKE = "rgba(255,60,60,0.95)";

interface Segments {
  /** x1,y1,x2,y2 world coordinates per segment, grouped by colour. */
  byColor: Map<string, number[]>;
  labels: { name: string; x: number; y: number }[];
}

export class ProvinceController implements Controller {
  private overlay: HTMLCanvasElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private banner: HTMLDivElement | null = null;
  private segments: Segments | null = null;
  private builtVersion = -1;
  private builtFor = -1;
  private strokes: TileRef[][] = [];
  private current: TileRef[] | null = null;
  private settings = new UserSettings();

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
    this.eventBus.on(ProvinceStrokeEvent, (e) => this.onStroke(e));
    window.addEventListener("keydown", this.onKey);
  }

  tick() {
    if (this.panel !== null) this.renderPanel();
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

    const o = this.transformHandler.worldToScreenCoordinates(new Cell(0, 0));
    const one = this.transformHandler.worldToScreenCoordinates(new Cell(1, 0));
    const s = one.x - o.x;
    const showBorders =
      this.settings.provinceBorders() || this.uiState.provinceDrawing === true;

    if (showBorders && this.segments !== null) {
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
    }

    // The drawing in progress.
    if (this.uiState.provinceDrawing === true) {
      ctx.strokeStyle = COLOR_STROKE;
      ctx.lineWidth = 3;
      const all = this.current ? [...this.strokes, this.current] : this.strokes;
      for (const stroke of all) {
        ctx.beginPath();
        stroke.forEach((t, i) => {
          const x = o.x + (this.game.x(t) + 0.5) * s;
          const y = o.y + (this.game.y(t) + 0.5) * s;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
  };

  // ---------------------------------------------------------------- toolbar

  private mountToolbar() {
    const bar = document.createElement("div");
    bar.setAttribute("data-province-toolbar", "");
    bar.style.cssText =
      "position:fixed;left:12px;bottom:200px;z-index:50;display:flex;flex-direction:column;gap:6px;";
    const btn = (label: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "background:rgba(15,23,42,.9);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 10px;font:600 12px system-ui,sans-serif;cursor:pointer;";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      return b;
    };
    bar.append(
      btn(translateText("provinces.panel_button"), () => this.togglePanel()),
      btn(translateText("provinces.draw_button"), () => this.startDrawing()),
      btn(translateText("provinces.borders_button"), () =>
        this.settings.toggleProvinceBorders(),
      ),
    );
    document.body.appendChild(bar);
    this.toolbar = bar;
  }

  // ---------------------------------------------------------------- drawing

  private startDrawing() {
    if (this.game.myPlayer()?.isAlive() !== true) return;
    this.strokes = [];
    this.current = null;
    this.uiState.provinceDrawing = true;
    this.mountBanner();
  }

  private stopDrawing() {
    this.uiState.provinceDrawing = false;
    this.strokes = [];
    this.current = null;
    this.banner?.remove();
    this.banner = null;
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.uiState.provinceDrawing !== true) return;
    if (e.key === "Escape") {
      this.stopDrawing();
      e.preventDefault();
    } else if (e.key === "Enter") {
      this.confirmDrawing();
      e.preventDefault();
    } else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
      this.strokes.pop();
      this.refreshBanner();
      e.preventDefault();
    }
  };

  private tileAt(x: number, y: number): TileRef | null {
    const cell = this.transformHandler.screenToWorldCoordinates(x, y);
    if (!this.game.isValidCoord(cell.x, cell.y)) return null;
    return this.game.ref(cell.x, cell.y);
  }

  private onStroke(e: ProvinceStrokeEvent) {
    if (this.uiState.provinceDrawing !== true) return;
    const t = this.tileAt(e.x, e.y);
    if (e.phase === "start") {
      this.current = t === null ? [] : [t];
      return;
    }
    if (this.current === null) return;
    if (t !== null && this.current[this.current.length - 1] !== t) {
      this.current.push(t);
    }
    if (e.phase === "end") {
      if (this.current.length >= 2) this.strokes.push(this.current);
      this.current = null;
      this.refreshBanner();
    }
  }

  private confirmDrawing() {
    const strokes = this.strokes;
    this.stopDrawing();
    if (strokes.length === 0) return;
    // Thin very long drawings to fit the wire limit, keeping each stroke's
    // ends so lines still meet the border where the player drew them.
    const total = strokes.reduce((n, s) => n + s.length, 0);
    const step = Math.max(1, Math.ceil(total / MAX_PROVINCE_POINTS));
    const points: TileRef[] = [];
    const breaks: number[] = [];
    for (const s of strokes) {
      if (points.length > 0) breaks.push(points.length);
      s.forEach((t, i) => {
        if (i % step === 0 || i === s.length - 1) points.push(t);
      });
    }
    this.eventBus.emit(
      new SendProvinceIntentEvent({
        action: "draw",
        points: points.slice(0, MAX_PROVINCE_POINTS),
        breaks: breaks.slice(0, 200),
      }),
    );
  }

  private mountBanner() {
    const b = document.createElement("div");
    b.setAttribute("data-province-draw", "");
    b.style.cssText =
      "position:fixed;top:84px;left:50%;transform:translateX(-50%);z-index:10000;" +
      "background:rgba(15,23,42,.92);color:#fff;border:1px solid rgba(255,255,255,.2);" +
      "border-radius:10px;padding:10px 14px;font:14px system-ui,sans-serif;" +
      "display:flex;gap:12px;align-items:center;max-width:calc(100vw - 32px);flex-wrap:wrap;";
    document.body.appendChild(b);
    this.banner = b;
    this.refreshBanner();
  }

  private refreshBanner() {
    const b = this.banner;
    if (b === null) return;
    b.textContent = "";
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = translateText("provinces.draw_title");
    const hint = document.createElement("div");
    hint.style.cssText = "opacity:.8;font-size:12px;";
    hint.textContent = translateText("provinces.draw_hint", {
      count: this.strokes.length,
    });
    text.append(title, hint);
    b.appendChild(text);
    b.append(
      this.button(translateText("provinces.confirm"), "#16a34a", () =>
        this.confirmDrawing(),
      ),
      this.button(translateText("provinces.undo"), "#475569", () => {
        this.strokes.pop();
        this.refreshBanner();
      }),
      this.button(translateText("provinces.cancel"), "#475569", () =>
        this.stopDrawing(),
      ),
    );
  }

  private button(label: string, bg: string, onClick: () => void) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;`;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  // ---------------------------------------------------------------- panel

  private togglePanel() {
    if (this.panel !== null) {
      this.panel.remove();
      this.panel = null;
      return;
    }
    const p = document.createElement("div");
    p.setAttribute("data-province-panel", "");
    p.style.cssText =
      "position:fixed;left:12px;bottom:300px;z-index:60;width:min(340px,calc(100vw - 24px));" +
      "max-height:50vh;overflow:auto;background:rgba(15,23,42,.94);color:#fff;" +
      "border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px;font:13px system-ui,sans-serif;";
    document.body.appendChild(p);
    this.panel = p;
    this.panelSignature = "";
    this.renderPanel();
  }

  private panelSignature = "";

  private renderPanel() {
    const panel = this.panel;
    if (panel === null) return;
    const me = this.game.myPlayer();
    const store = this.game.provinceStore();
    const mine = store
      .all()
      .filter((p) => me !== null && p.ownerID === me.smallID());
    // Rebuild only on change, so typing into a rename box isn't wiped.
    const sig = JSON.stringify(
      mine.map((p) => [p.id, p.name, p.size, p.held, p.administrative]),
    );
    if (sig === this.panelSignature) return;
    this.panelSignature = sig;

    panel.textContent = "";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;margin-bottom:6px;";
    title.textContent = translateText("provinces.panel_title");
    panel.appendChild(title);
    if (mine.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.75";
      empty.textContent = translateText("provinces.none_yet");
      panel.appendChild(empty);
      return;
    }
    for (const p of mine) panel.appendChild(this.provinceRow(p, mine));
  }

  private provinceRow(p: ProvinceInfo, mine: ProvinceInfo[]): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText =
      "border-top:1px solid rgba(255,255,255,.12);padding:8px 0;display:flex;flex-direction:column;gap:6px;";
    const head = document.createElement("div");
    const contested = p.held < p.size;
    head.innerHTML = "";
    const name = document.createElement("b");
    name.textContent = p.name;
    const meta = document.createElement("span");
    meta.style.cssText = "opacity:.75;margin-left:6px;font-size:12px;";
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
    row.appendChild(head);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
    const send = (
      intent: ConstructorParameters<typeof SendProvinceIntentEvent>[0],
    ) => this.eventBus.emit(new SendProvinceIntentEvent(intent));

    const input = document.createElement("input");
    input.value = p.name;
    input.maxLength = 32;
    input.style.cssText =
      "flex:1;min-width:120px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:3px 6px;";
    input.addEventListener("keydown", (e) => e.stopPropagation());
    actions.append(
      input,
      this.small(translateText("provinces.rename"), () =>
        send({ action: "rename", provinceId: p.id, name: input.value }),
      ),
    );
    if (!p.administrative) {
      actions.append(
        this.small(translateText("provinces.make_admin"), () =>
          send({ action: "admin", provinceId: p.id }),
        ),
      );
    }
    if (contested) {
      actions.append(
        this.small(translateText("provinces.trim"), () =>
          send({ action: "trim", provinceId: p.id }),
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
          send({
            action: "merge",
            provinceId: p.id,
            otherId: Number(sel.value),
          }),
        ),
      );
    }
    actions.append(
      this.small(translateText("provinces.disband"), () =>
        send({ action: "disband", provinceId: p.id }),
      ),
    );
    row.appendChild(actions);
    return row;
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
