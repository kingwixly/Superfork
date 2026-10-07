import { Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AircraftExecution } from "./AircraftExecution";
import {
  canEngageMirv,
  InterceptorMissileExecution,
} from "./InterceptorMissileExecution";

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
  // Phase 39: the one counter to a stealth bomber. Below the warheads: a
  // bomber loiters, a warhead in flight does not.
  UnitType.StealthBomber,
  UnitType.MIRVWarhead,
  UnitType.ASBMWarhead,
];

/**
 * Targets engaged with an air-to-air missile rather than by flying into
 * them. A MIRV moves far too fast to catch, so the interceptor shoots at it
 * from anywhere in its envelope the moment it appears.
 */
const MISSILE_TARGETS: ReadonlySet<UnitType> = new Set([
  UnitType.MIRV,
  UnitType.StealthBomber,
]);
/** Missile launch range against a stealth bomber, in tiles. */
export const AAM_RANGE_VS_AIRCRAFT = 30;
/** Ticks between an interceptor's missile shots. */
export const AAM_RELOAD = 20;

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
 * Since Phase 39 it does this with an air-to-air missile fired the moment a
 * MIRV enters its envelope (20% fail, one missile per MIRV at a time, three
 * attempts per MIRV), and the same missile is the only counter to a stealth
 * bomber. Other warheads are still rammed as before.
 *
 * That capability is paid for with fragility. Interceptors carry the lowest
 * health of any aircraft and cannot fight other aircraft — a fighter kills one
 * in a couple of passes and the interceptor cannot answer. The counterplay to
 * a strong air-defence net is therefore to sweep it with fighters first, which
 * is the trade-off the whole layer balances on.
 */
/** Radius of the interceptor's patrol circuit, in tiles. */
const INTERCEPTOR_PATROL_RADIUS = 16;

export class InterceptorExecution extends AircraftExecution {
  private patrolTile: TileRef;
  private patrolLeg = 0;
  private lastShot = Number.NEGATIVE_INFINITY;

  constructor(unit: Unit, home: Unit | undefined, patrolTile: TileRef) {
    super(unit, home);
    this.patrolTile = patrolTile;
  }

  protected onOrdered(tile: TileRef): void {
    // Move the circuit, not just the heading - otherwise the aircraft flies
    // to the ordered tile and then drifts back to its original patrol.
    this.patrolTile = tile;
    this.patrolLeg = 0;
    this.destination = tile;
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

    if (MISSILE_TARGETS.has(target.type())) {
      this.engageWithMissile(target, ticks);
      return;
    }

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
   * Phase 39 redo. A MIRV is engaged the moment it is anywhere in the
   * envelope: the interceptor fires at once and keeps closing. Only one
   * missile is ever in the air at a MIRV, and it draws at most three in all
   * (see InterceptorMissileExecution). A stealth bomber is chased into
   * missile range first.
   */
  private engageWithMissile(target: Unit, ticks: number): void {
    const tile = target.tile();
    this.destination = tile;
    if (ticks - this.lastShot < AAM_RELOAD) return;
    if (target.type() === UnitType.MIRV) {
      if (!canEngageMirv(target)) return;
    } else if (this.distanceTo(tile) > AAM_RANGE_VS_AIRCRAFT) {
      return;
    }
    this.lastShot = ticks;
    this.mg.addExecution(
      new InterceptorMissileExecution(this.owner(), this.unit.tile(), target),
    );
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
    // MIRVs already being shot at, or out of attempts, are someone else's
    // problem (or nobody's): look past them.
    const found = this.hostileAircraftNear(range, INTERCEPT_TARGETS).filter(
      (u) => u.type() !== UnitType.MIRV || canEngageMirv(u),
    );
    if (found.length === 0) return undefined;
    found.sort(
      (a, b) =>
        INTERCEPT_TARGETS.indexOf(a.type()) -
        INTERCEPT_TARGETS.indexOf(b.type()),
    );
    return found[0];
  }

  protected onArrived(): void {
    // Same as the fighter: circuit rather than hover. An interceptor parked
    // on one tile covers far less sky than one that moves.
    this.patrolLeg = (this.patrolLeg + 1) % 4;
    const map = this.mg.map();
    const w = map.width();
    const cx = this.patrolTile % w;
    const cy = (this.patrolTile / w) | 0;
    const offsets = [
      [INTERCEPTOR_PATROL_RADIUS, 0],
      [0, INTERCEPTOR_PATROL_RADIUS],
      [-INTERCEPTOR_PATROL_RADIUS, 0],
      [0, -INTERCEPTOR_PATROL_RADIUS],
    ];
    const [dx, dy] = offsets[this.patrolLeg];
    this.destination = map.ref(
      Math.min(map.width() - 1, Math.max(0, cx + dx)),
      Math.min(map.height() - 1, Math.max(0, cy + dy)),
    );
  }
}
