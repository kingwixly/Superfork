import { Execution, Game, MessageType, Player, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { MAX_PROVINCE_NAME } from "../game/Provinces";
import { ProvinceIntent } from "../Schemas";
import { validateUsername } from "../validations/username";

/**
 * Every province action a player can take: draw, rename, mark as the
 * administrative province, disband, merge, trim to owned land.
 *
 * All of them act only on the sender's own provinces, and all are refused
 * outright unless the lobby turned provinces on.
 */
export class ProvinceExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private intent: ProvinceIntent,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.config().provincesEnabled()) return;
    if (!this.player.isAlive()) return;
    const provinces = mg.provinces();
    const i = this.intent;

    if (i.action === "draw") {
      const strokes = splitStrokes(i.points ?? [], i.breaks ?? []);
      const capital = this.player.units(UnitType.Capital)[0]?.tile();
      const made = provinces.draw(this.player, strokes, capital);
      // Say what happened: a drawing that creates nothing is otherwise
      // indistinguishable from a broken tool.
      if (made.length > 0) {
        mg.displayMessage(
          "events_display.provinces_created",
          MessageType.ALLIANCE_ACCEPTED,
          this.player.id(),
          undefined,
          { count: made.length },
        );
      } else {
        mg.displayMessage(
          "events_display.provinces_none",
          MessageType.ALLIANCE_REJECTED,
          this.player.id(),
          undefined,
          { min: provinces.minSize(this.player) },
        );
      }
      return;
    }

    const p =
      i.provinceId === undefined ? undefined : provinces.get(i.provinceId);
    if (p === undefined || p.owner !== this.player) return;

    switch (i.action) {
      case "rename": {
        const name = (i.name ?? "").trim();
        if (name.length === 0 || name.length > MAX_PROVINCE_NAME) return;
        // Shown to every player, so it gets the username abuse filter.
        if (!validateUsername(name).isValid) return;
        provinces.rename(p, name);
        return;
      }
      case "admin":
        provinces.setAdministrative(p);
        return;
      case "disband":
        provinces.disband(p);
        return;
      case "trim":
        provinces.trim(p);
        return;
      case "merge": {
        const other =
          i.otherId === undefined ? undefined : provinces.get(i.otherId);
        if (other === undefined || other === p) return;
        if (other.owner !== this.player) return;
        if (!provinces.adjacent(p, other)) return;
        provinces.merge(p, other);
        return;
      }
    }
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/** Undo the wire flattening: `breaks` are the start indexes of strokes 2+. */
export function splitStrokes(points: TileRef[], breaks: number[]): TileRef[][] {
  const out: TileRef[][] = [];
  let start = 0;
  for (const b of [...breaks].sort((x, y) => x - y)) {
    if (b <= start || b > points.length) continue;
    out.push(points.slice(start, b));
    start = b;
  }
  out.push(points.slice(start));
  return out.filter((s) => s.length > 0);
}
