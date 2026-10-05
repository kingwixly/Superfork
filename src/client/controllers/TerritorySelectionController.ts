/**
 * TerritorySelectionController — mark tiles on the map, then confirm.
 *
 * Used by Diplomacy → Cede (mark an area of your own land to hand over) and
 * Diplomacy → Embassy (pick one tile inside the host's territory).
 *
 * The first version of this had no visible state at all: no banner, no
 * highlight, one tile per click, Enter to confirm (never said anywhere), and
 * every click also went through to the normal click handler - so clicking
 * enemy land to place an embassy launched an attack. It now:
 *
 *  - shows a banner with instructions, a tile count, Send and Cancel;
 *  - draws the marked tiles over the map;
 *  - marks a brush disc per click rather than a single tile;
 *  - sets UIState.territorySelection so other click handlers stand down.
 */

import { EventBus } from "../../core/EventBus";
import { Cell, PlayerID } from "../../core/game/Game";
import { TileRef } from "../../core/game/GameMap";
import { MAX_CEDE_TILES } from "../../core/Schemas";
import { Controller } from "../Controller";
import { MouseUpEvent } from "../InputHandler";
import { TransformHandler } from "../TransformHandler";
import {
  SendCedeLandIntentEvent,
  SendEmbassyRequestIntentEvent,
} from "../Transport";
import { UIState } from "../UIState";
import { translateText } from "../Utils";
import { GameView } from "../view";

/** What a completed selection is for. */
export type SelectionPurpose = "cede" | "embassy";

export interface SelectionRequest {
  purpose: SelectionPurpose;
  targetID: PlayerID;
  /** Tiles to start with. */
  initial?: TileRef[];
}

/** Raised by the diplomacy menu to begin a selection. */
export class BeginTerritorySelectionEvent {
  constructor(public readonly request: SelectionRequest) {}
}

/** Radius, in tiles, of the area one click marks when ceding. */
export const CEDE_BRUSH_RADIUS = 6;

export class TerritorySelectionController implements Controller {
  private active: SelectionRequest | null = null;
  private selected = new Set<TileRef>();
  private banner: HTMLDivElement | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private frame: number | null = null;

  constructor(
    private eventBus: EventBus,
    private game: GameView,
    private transformHandler: TransformHandler,
    private uiState?: UIState,
  ) {}

  init() {
    this.eventBus.on(BeginTerritorySelectionEvent, (e) =>
      this.begin(e.request),
    );
    this.eventBus.on(MouseUpEvent, (e) => this.onClick(e.x, e.y));
    window.addEventListener("keydown", this.onKey);
  }

  private targetName(): string {
    if (this.active === null) return "";
    try {
      return this.game.player(this.active.targetID).displayName();
    } catch {
      return "";
    }
  }

  private begin(request: SelectionRequest): void {
    this.cancel();
    this.active = request;
    this.selected = new Set(request.initial ?? []);
    if (this.uiState) this.uiState.territorySelection = true;
    this.mountUi();
    this.refreshBanner();
  }

  private cancel(): void {
    this.active = null;
    this.selected.clear();
    if (this.uiState) this.uiState.territorySelection = false;
    this.unmountUi();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.active === null) return;
    if (e.key === "Escape") {
      this.cancel();
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      this.confirm();
      e.preventDefault();
    }
  };

  private tileAt(x: number, y: number): TileRef | null {
    const cell = this.transformHandler.screenToWorldCoordinates(x, y);
    if (!this.game.isValidCoord(cell.x, cell.y)) return null;
    return this.game.ref(cell.x, cell.y);
  }

  private onClick(x: number, y: number): void {
    if (this.active === null) return;
    const tile = this.tileAt(x, y);
    if (tile === null) return;

    if (this.active.purpose === "embassy") {
      // Single tile, and it must belong to the host - an embassy stands on
      // their ground by definition.
      const host = this.game.owner(tile);
      if (!host.isPlayer() || host.id() !== this.active.targetID) return;
      this.selected = new Set([tile]);
      this.confirm();
      return;
    }

    if (!this.ownsForCede(tile)) return;
    const removing = this.selected.has(tile);
    for (const t of this.disc(tile, CEDE_BRUSH_RADIUS)) {
      if (removing) {
        this.selected.delete(t);
      } else if (this.ownsForCede(t) && this.selected.size < MAX_CEDE_TILES) {
        this.selected.add(t);
      }
    }
    this.refreshBanner();
  }

  private disc(center: TileRef, r: number): TileRef[] {
    const cx = this.game.x(center);
    const cy = this.game.y(center);
    const out: TileRef[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.game.isValidCoord(x, y)) continue;
        out.push(this.game.ref(x, y));
      }
    }
    return out;
  }

  /** Only your own land can be ceded. */
  private ownsForCede(tile: TileRef): boolean {
    const me = this.game.myPlayer();
    if (me === null) return false;
    const owner = this.game.owner(tile);
    return owner.isPlayer() && owner.smallID() === me.smallID();
  }

  private confirm(): void {
    const req = this.active;
    if (req === null) return;
    const tiles = [...this.selected];
    this.cancel();
    if (tiles.length === 0) return;

    if (req.purpose === "embassy") {
      this.eventBus.emit(
        new SendEmbassyRequestIntentEvent(req.targetID, tiles[0]),
      );
    } else {
      this.eventBus.emit(new SendCedeLandIntentEvent(req.targetID, tiles));
    }
  }

  // ------------------------------------------------------------------ UI --

  private mountUi(): void {
    if (typeof document === "undefined") return;
    const banner = document.createElement("div");
    banner.setAttribute("data-territory-select", "");
    banner.style.cssText =
      // Below the hovered-nation info bar (which sits top-centre and covered
      // this banner) and above every other HUD layer.
      "position:fixed;top:84px;left:50%;transform:translateX(-50%);z-index:10000;" +
      "background:rgba(15,23,42,.92);color:#fff;border:1px solid rgba(255,255,255,.2);" +
      "border-radius:10px;padding:10px 14px;font:14px system-ui,sans-serif;" +
      "display:flex;gap:12px;align-items:center;max-width:calc(100vw - 32px);flex-wrap:wrap;";
    document.body.appendChild(banner);
    this.banner = banner;

    const overlay = document.createElement("canvas");
    overlay.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:5;";
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.draw();
  }

  private unmountUi(): void {
    this.banner?.remove();
    this.banner = null;
    this.overlay?.remove();
    this.overlay = null;
    if (this.frame !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  private refreshBanner(): void {
    const req = this.active;
    const banner = this.banner;
    if (req === null || banner === null) return;
    const player = this.targetName();
    const cede = req.purpose === "cede";
    banner.textContent = "";

    const text = document.createElement("div");
    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = cede
      ? translateText("territory_select.cede_title", { player })
      : translateText("territory_select.embassy_title", { player });
    const hint = document.createElement("div");
    hint.style.opacity = "0.8";
    hint.style.fontSize = "12px";
    hint.textContent = cede
      ? translateText("territory_select.cede_hint", { player }) +
        " · " +
        translateText("territory_select.tiles", { count: this.selected.size })
      : translateText("territory_select.embassy_hint", { player });
    text.append(title, hint);
    banner.appendChild(text);

    const button = (label: string, bg: string, onClick: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = `background:${bg};color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;`;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      return b;
    };
    if (cede) {
      const send = button(
        translateText("territory_select.confirm"),
        "#16a34a",
        () => this.confirm(),
      );
      send.disabled = this.selected.size === 0;
      if (send.disabled) send.style.opacity = "0.5";
      banner.appendChild(send);
    }
    banner.appendChild(
      button(translateText("territory_select.cancel"), "#475569", () =>
        this.cancel(),
      ),
    );
  }

  /** Paint the marked tiles over the map every frame while selecting. */
  private draw = (): void => {
    const canvas = this.overlay;
    if (canvas === null || this.active === null) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (ctx !== null) {
      ctx.clearRect(0, 0, w, h);
      const origin = this.transformHandler.worldToScreenCoordinates(
        new Cell(0, 0),
      );
      const step = this.transformHandler.worldToScreenCoordinates(
        new Cell(1, 0),
      );
      const size = Math.max(1, step.x - origin.x);
      ctx.fillStyle = "rgba(250, 204, 21, 0.55)";
      for (const t of this.selected) {
        const p = this.transformHandler.worldToScreenCoordinates(
          new Cell(this.game.x(t), this.game.y(t)),
        );
        if (p.x < -size || p.y < -size || p.x > w || p.y > h) continue;
        ctx.fillRect(p.x, p.y, size + 0.5, size + 0.5);
      }
    }
    if (typeof requestAnimationFrame !== "undefined") {
      this.frame = requestAnimationFrame(this.draw);
    }
  };

  /** Tiles currently marked. */
  public selection(): ReadonlySet<TileRef> {
    return this.selected;
  }

  public isActive(): boolean {
    return this.active !== null;
  }
}
