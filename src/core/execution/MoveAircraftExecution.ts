import { Aircraft, Execution, Game, Player } from "../game/Game";
import { TileRef } from "../game/GameMap";

/**
 * Retarget aircraft.
 *
 * The move_aircraft intent has existed since Phase 1 with nothing behind it,
 * so aircraft flew to wherever they were first sent and could never be
 * redirected. Patrol state lives in the aircraft's execution rather than on
 * the unit, so this writes the new point to the unit's target tile and the
 * executions pick it up on their next tick.
 */
export class MoveAircraftExecution implements Execution {
  private active = true;

  constructor(
    private readonly owner: Player,
    private readonly unitIds: number[],
    private readonly position: TileRef,
  ) {}

  init(mg: Game, _ticks: number): void {
    this.active = false;
    if (!mg.isValidRef(this.position)) return;

    const byId = new Map(
      Aircraft.types
        .flatMap((t) => this.owner.units(t))
        .map((u) => [u.id(), u]),
    );
    for (const unitId of new Set(this.unitIds)) {
      const unit = byId.get(unitId);
      if (unit === undefined || !unit.isActive()) continue;
      unit.setTargetTile(this.position);
    }
  }

  tick(_ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
