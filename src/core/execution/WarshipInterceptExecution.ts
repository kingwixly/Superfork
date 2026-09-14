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
/** Warheads a warship will engage, most valuable first. */
const INTERCEPT_PRIORITY: UnitType[] = [
  UnitType.MIRV,
  UnitType.HydrogenBomb,
  UnitType.AtomBomb,
  UnitType.ASBM,
  UnitType.NeutronBomb,
  UnitType.EMPBomb,
  UnitType.MIRVWarhead,
  UnitType.ASBMWarhead,
];

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
    // Nothing in flight anywhere: skip the spatial query entirely. This ran
    // per warship per tick, eight separate queries deep, whether or not a
    // single warhead existed.
    let anyWarhead = false;
    for (const t of INTERCEPT_PRIORITY) {
      if (this.mg.unitCount(t) > 0) {
        anyWarhead = true;
        break;
      }
    }
    if (!anyWarhead) return undefined;

    const tile = this.warship.tile();
    if (tile === undefined) return undefined;

    const owner = this.warship.owner();

    // ONE query for every warhead type, then rank in memory. The previous
    // version ran eight radius queries per warship per tick; the grid lookup
    // dominates, so folding them into one is close to an 8x saving here.
    //
    // WARSHIP_INTERCEPT_RANGE, deliberately NOT unitInfo().range - that is the
    // gun engagement range every surface combatant has. This is the anti-nuke
    // radius, which only the reworked Warship carries.
    const hostile = this.mg
      .nearbyUnits(tile, WARSHIP_INTERCEPT_RANGE, INTERCEPT_PRIORITY)
      .filter(
        ({ unit }) =>
          unit.isActive() &&
          unit.owner().id() !== owner.id() &&
          !owner.isFriendly(unit.owner()),
      );
    if (hostile.length === 0) return undefined;

    // Value order first, distance only as a tiebreak - an unseparated MIRV
    // still outranks a closer atom bomb.
    hostile.sort((a, b) => {
      const rank =
        INTERCEPT_PRIORITY.indexOf(a.unit.type()) -
        INTERCEPT_PRIORITY.indexOf(b.unit.type());
      return rank !== 0 ? rank : a.distSquared - b.distSquared;
    });
    return hostile[0].unit;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
