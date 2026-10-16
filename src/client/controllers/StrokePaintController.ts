/**
 * StrokePaintController — the freehand border-painting tool.
 *
 * Shared by the province drawer and the UCI country creator. While it is
 * open, dragging on the map paints a line instead of panning; Enter (or the
 * banner's confirm button) hands the lines to whoever opened it, Ctrl+Z
 * undoes the last line and Escape cancels.
 *
 * Lines are sent as tile refs flattened into `points`, with `breaks` marking
 * where each line after the first begins (zbin has no nested arrays).
 */

import { TileRef } from "@openfront/engine-api/game/GameMap";
import { Cell } from "@openfront/engine-api/game/GameTypes";
import {
  MAX_PROVINCE_POINTS,
  MAX_STROKE_BREAKS,
} from "@openfront/engine-api/Schemas";
import { EventBus } from "@openfront/shared/EventBus";
import { Controller } from "../Controller";
import { StrokeEvent } from "../InputHandler";
import { TransformHandler } from "../TransformHandler";
import { UIState } from "../UIState";
import { translateText } from "../Utils";
import { GameView } from "../view";

export interface StrokePaintRequest {
  title: string;
  /** Called with the line count so far. */
  hint: (lines: number) => string;
  confirmLabel: string;
  onConfirm: (points: TileRef[], breaks: number[]) => void;
  /** Line colour. */
  color?: string;
}

/** Opens the painting tool. */
export class BeginStrokePaintEvent {
  constructor(public readonly request: StrokePaintRequest) {}
}

export class StrokePaintController implements Controller {
  private request: StrokePaintRequest | null = null;
  private strokes: TileRef[][] = [];
  private current: TileRef[] | null = null;
  private banner: HTMLDivElement | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private frame: number | null = null;

  constructor(
    private eventBus: EventBus,
    private game: GameView,
    private transformHandler: TransformHandler,
    private uiState: UIState,
  ) {}

  init() {
    this.eventBus.on(BeginStrokePaintEvent, (e) => this.begin(e.request));
    this.eventBus.on(StrokeEvent, (e) => this.onStroke(e));
    window.addEventListener("keydown", this.onKey);
  }

  isActive(): boolean {
    return this.request !== null;
  }

  private begin(request: StrokePaintRequest) {
    this.cancel();
    this.request = request;
    this.strokes = [];
    this.current = null;
    this.uiState.strokePainting = true;
    this.mount();
  }

  private cancel() {
    this.request = null;
    this.strokes = [];
    this.current = null;
    this.uiState.strokePainting = false;
    this.banner?.remove();
    this.banner = null;
    this.overlay?.remove();
    this.overlay = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.request === null) return;
    if (e.key === "Escape") {
      this.cancel();
      e.preventDefault();
    } else if (e.key === "Enter") {
      this.confirm();
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

  private onStroke(e: StrokeEvent) {
    if (this.request === null) return;
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

  private confirm() {
    const req = this.request;
    const strokes = this.strokes;
    this.cancel();
    if (req === null || strokes.length === 0) return;
    // Thin very long drawings to fit the wire limit, keeping each line's ends
    // so lines still meet where the player drew them.
    const total = strokes.reduce((n, s) => n + s.length, 0);
    const step = Math.max(1, Math.ceil(total / MAX_PROVINCE_POINTS));
    const points: TileRef[] = [];
    const breaks: number[] = [];
    for (const s of strokes.slice(0, MAX_STROKE_BREAKS + 1)) {
      if (points.length > 0) breaks.push(points.length);
      s.forEach((t, i) => {
        if (i % step === 0 || i === s.length - 1) points.push(t);
      });
    }
    req.onConfirm(points.slice(0, MAX_PROVINCE_POINTS), breaks);
  }

  // ------------------------------------------------------------------ UI --

  private mount() {
    const b = document.createElement("div");
    b.setAttribute("data-stroke-paint", "");
    b.style.cssText =
      "position:fixed;top:84px;left:50%;transform:translateX(-50%);z-index:10000;" +
      "background:rgba(15,23,42,.92);color:#fff;border:1px solid rgba(255,255,255,.2);" +
      "border-radius:10px;padding:10px 14px;font:14px system-ui,sans-serif;" +
      "display:flex;gap:12px;align-items:center;max-width:calc(100vw - 32px);flex-wrap:wrap;";
    document.body.appendChild(b);
    this.banner = b;
    this.refreshBanner();

    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:6;";
    document.body.appendChild(c);
    this.overlay = c;
    this.frame = requestAnimationFrame(this.draw);
  }

  private refreshBanner() {
    const b = this.banner;
    const req = this.request;
    if (b === null || req === null) return;
    b.textContent = "";
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = req.title;
    const hint = document.createElement("div");
    hint.style.cssText = "opacity:.8;font-size:12px;";
    hint.textContent = req.hint(this.strokes.length);
    text.append(title, hint);
    b.appendChild(text);
    const confirm = this.button(req.confirmLabel, "#16a34a", () =>
      this.confirm(),
    );
    if (this.strokes.length === 0) confirm.style.opacity = "0.5";
    b.append(
      confirm,
      this.button(translateText("provinces.undo"), "#475569", () => {
        this.strokes.pop();
        this.refreshBanner();
      }),
      this.button(translateText("provinces.cancel"), "#475569", () =>
        this.cancel(),
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

  private draw = () => {
    const c = this.overlay;
    if (c === null || this.request === null) return;
    this.frame = requestAnimationFrame(this.draw);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, W, H);
    const o = this.transformHandler.worldToScreenCoordinates(new Cell(0, 0));
    const one = this.transformHandler.worldToScreenCoordinates(new Cell(1, 0));
    const s = one.x - o.x;
    ctx.strokeStyle = this.request.color ?? "rgba(255,60,60,0.95)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
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
  };
}
