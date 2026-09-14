import { Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AircraftExecution } from "./AircraftExecution";

/**
 * Everything an interceptor can shoot at. Ordered by value, and that order is
 * the whole design: an unseparated MIRV is worth more than anything else in
 * the game to kill, because one hit removes 350 warheads.
 */
const INTERCEPT_TARGETS = [
  UnitType.MIRV,
  UnitType.HydrogenBomb,
  UnitType.AtomBomb,
  UnitType.ASBM,
  UnitType.NeutronBomb,
  UnitType.EMPBomb,
  UnitType.MIRVWarhead,
  UnitType.ASBMWarhead,
];

/**
 * Interceptor aircraft.
 *
 * A flying SAM battery, with one capability nothing else has: it can kill a
 * MIRV **before it separates**. `MIRVExecution` already aborts and cancels
 * every staged warhead execution when its unit dies externally, so a single
 * interception before the separation point removes all 350 warheads at once.
 * After separation there is nothing left to hit but individual warheads, and
 * it is far too late.
 *
 * That capability is paid for with fragility. Interceptors carry the lowest
 * health of any aircraft and no air-to-air weapon at all — a fighter kills one
 * in a couple of passes and the interceptor cannot answer. The counterplay to
 * a strong air-defence net is therefore to sweep it with fighters first, which
 * is the trade-off the whole layer balances on.
 */
export class InterceptorExecution extends AircraftExecution {
  private patrolTile: TileRef;

  constructor(unit: Unit, home: Unit | undefined, patrolTile: TileRef) {
    super(unit, home);
    this.patrolTile = patrolTile;
  }

  protected decide(ticks: number): void {
    if (!this.inRangeOfHome()) {
      this.returnToBase();
      return;
    }

    const target = this.bestTarget();
    if (target === undefined) {
      this.destination ??= this.patrolTile;
      return;
    }

    const tile = target.tile();
    if (tile === undefined) return;

    if (this.distanceTo(tile) <= 2) {
      // Interception is a kill, not damage: warheads have no meaningful
      // health, and a partly-destroyed nuke is not a thing.
      target.delete(true, this.owner());
      this.destination = undefined;
      return;
    }
    this.destination = tile;
  }

  /**
   * The highest-value hostile munition in range.
   *
   * Scans in INTERCEPT_TARGETS order rather than by distance, so a MIRV is
   * always preferred over a closer atom bomb. Chasing the nearest target would
   * make interceptors waste themselves on single warheads while the cluster
   * munition they exist to stop flies past.
   */
  private bestTarget(): Unit | undefined {
    // Nothing in flight anywhere: skip the query. Interceptors patrol
    // constantly, so without this they each ran eight radius-120 lookups
    // every tick for warheads that did not exist.
    let any = false;
    for (const t of INTERCEPT_TARGETS) {
      if (this.mg.unitCount(t) > 0) {
        any = true;
        break;
      }
    }
    if (!any) return undefined;

    const range = this.mg.config().unitInfo(UnitType.Interceptor).range ?? 120;
    // ONE query across every warhead type, ranked in memory afterwards.
    const found = this.hostileAircraftNear(range, INTERCEPT_TARGETS);
    if (found.length === 0) return undefined;
    found.sort(
      (a, b) =>
        INTERCEPT_TARGETS.indexOf(a.type()) -
        INTERCEPT_TARGETS.indexOf(b.type()),
    );
    return found[0];
  }

  protected onArrived(): void {
    this.destination = undefined;
  }
}
