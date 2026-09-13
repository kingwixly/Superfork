import { WARSHIP_INTERCEPT_RANGE } from "../configuration/SuperforkUnits";
import { Execution, Game, Unit, UnitType } from "../game/Game";

/**
 * Warship nuke interception (superfork).
 *
 * The Phase 4 rework splits vanilla Warship in two: the **Destroyer** keeps
 * the old pure surface-combat role, and the **Warship** becomes a heavier
 * escort that also shoots down nuclear warheads passing through its radius.
 *
 * Implemented as a separate execution attached alongside `WarshipExecution`
 * rather than folded into it. Two reasons:
 *
 *  - `WarshipExecution` is 825 lines of surface-combat state machine, and
 *    interception is orthogonal to all of it — it does not care whether the
 *    ship is patrolling, hunting or retreating.
 *  - It keeps the Destroyer split trivial. A destroyer is a warship that does
 *    not get this execution, rather than a warship with a flag threaded
 *    through a long state machine.
 *
 * The radius is deliberately smaller than a SAM launcher's. A warship is
 * mobile and a SAM site is not; being able to reposition your anti-nuke
 * coverage is worth more than raw area, so the area is the thing that pays
 * for it.
 */
export class WarshipInterceptExecution implements Execution {
  private mg: Game;
  private active = true;
  private lastIntercept = 0;

  constructor(private warship: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.warship.isActive()) {
      this.active = false;
      return;
    }

    const cooldown = this.mg.config().SAMCooldown();
    if (ticks - this.lastIntercept < cooldown) return;

    const target = this.findTarget();
    if (target === undefined) return;

    target.delete(true, this.warship.owner());
    this.lastIntercept = ticks;
  }

  /**
   * The highest-value hostile warhead inside the radius.
   *
   * Ordered like the interceptor's: an unseparated MIRV outranks everything,
   * because killing it cancels the whole cluster. Unlike the interceptor a
   * warship cannot chase — it only defends the water it happens to be in — so
   * this is pure opportunity, not pursuit.
   */
  private findTarget(): Unit | undefined {
    const tile = this.warship.tile();
    if (tile === undefined) return undefined;

    // Deliberately NOT unitInfo().range - that is the gun engagement range,
    // which every surface combatant has. This is the anti-nuke radius, which
    // only the reworked Warship carries.
    const range = WARSHIP_INTERCEPT_RANGE;
    const owner = this.warship.owner();

    for (const type of [
      UnitType.MIRV,
      UnitType.HydrogenBomb,
      UnitType.AtomBomb,
      UnitType.ASBM,
      UnitType.NeutronBomb,
      UnitType.EMPBomb,
      UnitType.MIRVWarhead,
      UnitType.ASBMWarhead,
    ]) {
      const found = this.mg
        .nearbyUnits(tile, range, [type])
        .filter(
          ({ unit }) =>
            unit.isActive() &&
            unit.owner().id() !== owner.id() &&
            !owner.isFriendly(unit.owner()),
        )
        .sort((a, b) => a.distSquared - b.distSquared)[0];
      if (found !== undefined) return found.unit;
    }
    return undefined;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
