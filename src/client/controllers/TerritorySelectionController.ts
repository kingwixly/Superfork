/**
 * TerritorySelectionController — paint a set of your own tiles, then confirm.
 *
 * Three features needed this and none of them could ship without it: ceding
 * land, liberating a nation (which is ceding land you took FROM them), and
 * placing an embassy. Each of those has had a working execution for many
 * phases and no way for a player to say WHICH tiles.
 *
 * The flow: enter a mode with a target nation, click or drag over your own
 * territory to paint a selection, press Enter to confirm or Escape to cancel.
 *
 * Liberation is not a separate mode. It enters the same cede mode with the
 * selection pre-filled from the conquest ledger — every tile you currently
 * hold that you took from the target. That keeps one mechanic rather than
 * two, and lets a player adjust the offer before sending it.
 */

import { EventBus } from "../../core/EventBus";
import { PlayerID } from "../../core/game/Game";
import { TileRef } from "../../core/game/GameMap";
import { Controller } from "../Controller";
import { MouseMoveEvent, MouseUpEvent } from "../InputHandler";
import { TransformHandler } from "../TransformHandler";
import {
  SendCedeLandIntentEvent,
  SendEmbassyRequestIntentEvent,
} from "../Transport";
import { GameView } from "../view";

/** What a completed selection is for. */
export type SelectionPurpose = "cede" | "embassy";

export interface SelectionRequest {
  purpose: SelectionPurpose;
  targetID: PlayerID;
  /** Tiles to start with, e.g. liberation pre-fill. */
  initial?: TileRef[];
}

/** Raised by the diplomacy menu to begin a selection. */
export class BeginTerritorySelectionEvent {
  constructor(public readonly request: SelectionRequest) {}
}

export class TerritorySelectionController implements Controller {
  private active: SelectionRequest | null = null;
  private selected = new Set<TileRef>();
  private painting = false;

  constructor(
    private eventBus: EventBus,
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {}

  init() {
    this.eventBus.on(BeginTerritorySelectionEvent, (e) =>
      this.begin(e.request),
    );
    this.eventBus.on(MouseUpEvent, (e) => this.onClick(e.x, e.y));
    this.eventBus.on(MouseMoveEvent, (e) => this.onMove(e.x, e.y));
    window.addEventListener("keydown", this.onKey);
  }

  private begin(request: SelectionRequest): void {
    this.active = request;
    this.selected = new Set(request.initial ?? []);
    // An embassy is a single tile on the HOST's land, not an area of your own,
    // so it never pre-fills and only ever keeps the last tile clicked.
    this.painting = false;
  }

  private cancel(): void {
    this.active = null;
    this.selected.clear();
    this.painting = false;
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

    this.toggle(tile);
    this.painting = true;
  }

  private onMove(x: number, y: number): void {
    if (this.active === null || !this.painting) return;
    if (this.active.purpose === "embassy") return;
    const tile = this.tileAt(x, y);
    if (tile !== null) this.add(tile);
  }

  /** Only your own land can be ceded, so anything else is ignored silently. */
  private ownsForCede(tile: TileRef): boolean {
    const me = this.game.myPlayer();
    return me !== null && this.game.owner(tile) === me;
  }

  private add(tile: TileRef): void {
    if (!this.ownsForCede(tile)) return;
    this.selected.add(tile);
  }

  private toggle(tile: TileRef): void {
    if (!this.ownsForCede(tile)) return;
    if (this.selected.has(tile)) this.selected.delete(tile);
    else this.selected.add(tile);
  }

  private confirm(): void {
    const req = this.active;
    if (req === null) return;
    const tiles = [...this.selected];
    this.cancel();
    if (tiles.length === 0) return;

    // Emitted directly rather than through PlayerActionHandler, which is
    // owned by the radial menu and not reachable from a controller.
    if (req.purpose === "embassy") {
      this.eventBus.emit(
        new SendEmbassyRequestIntentEvent(req.targetID, tiles[0]),
      );
    } else {
      this.eventBus.emit(new SendCedeLandIntentEvent(req.targetID, tiles));
    }
  }

  /** Tiles currently painted, for the renderer to highlight. */
  public selection(): ReadonlySet<TileRef> {
    return this.selected;
  }

  public isActive(): boolean {
    return this.active !== null;
  }
}
