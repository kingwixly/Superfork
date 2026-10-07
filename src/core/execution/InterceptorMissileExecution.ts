import {
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import {
  AirPosition,
  airPositionOf,
  stepToward,
  tileOfAirPosition,
} from "./utils/AirMotion";

/** Percent chance an interceptor's missile fails to kill what it reaches. */
export const INTERCEPT_FAILURE_PERCENT = 20;
/** Most interception attempts any one MIRV can draw. */
export const MAX_MIRV_INTERCEPT_ATTEMPTS = 3;
/** A missile that has not reached its target after this long is lost. */
const MISSILE_LIFETIME = 60;

/** Missile speed in tiles per tick. Faster than a MIRV (15). */
const SPEED_VS_MIRV = 30;
const SPEED_VS_AIRCRAFT = 6;

/**
 * Who is shooting at each MIRV, and how often it has been shot at. Shared by
 * every interceptor so only one engages a MIRV at a time, and a MIRV that
 * has survived three missiles is left alone.
 */
interface MirvEngagement {
  inFlight: boolean;
  attempts: number;
}
const engagements = new WeakMap<Unit, MirvEngagement>();

function engagementOf(mirv: Unit): MirvEngagement {
  let e = engagements.get(mirv);
  if (e === undefined) {
    e = { inFlight: false, attempts: 0 };
    engagements.set(mirv, e);
  }
  return e;
}

/** Whether an interceptor may fire at this MIRV now. */
export function canEngageMirv(mirv: Unit): boolean {
  const e = engagements.get(mirv);
  if (e === undefined) return true;
  return !e.inFlight && e.attempts < MAX_MIRV_INTERCEPT_ATTEMPTS;
}

/** Missiles fired at this MIRV so far (resolved or in flight). */
export function mirvInterceptAttempts(mirv: Unit): number {
  const e = engagements.get(mirv);
  if (e === undefined) return 0;
  return e.attempts + (e.inFlight ? 1 : 0);
}

/**
 * An interceptor's air-to-air missile.
 *
 * Against a MIRV it is the whole point of the interceptor: one hit before
 * separation removes every warhead. It flies at twice the MIRV's speed and
 * homes on it; if the MIRV separates first, the missile has nothing left to
 * hit. Against a stealth bomber it does damage like a fighter's missile.
 *
 * Either way it fails 20% of the time, decided by a seeded roll so every
 * client agrees.
 */
export class InterceptorMissileExecution implements Execution {
  private mg: Game;
  private active = true;
  private missile: Unit | null = null;
  private pos: AirPosition;
  private age = 0;

  constructor(
    private owner: Player,
    private launchTile: TileRef,
    private target: Unit,
  ) {
    if (target.type() === UnitType.MIRV) {
      engagementOf(target).inFlight = true;
    }
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.pos = airPositionOf(mg, this.launchTile);
    this.missile = this.owner.buildUnit(
      UnitType.AAMissile,
      this.launchTile,
      { targetUnit: this.target },
      { free: true },
    );
  }

  private isMirv(): boolean {
    return this.target.type() === UnitType.MIRV;
  }

  tick(ticks: number): void {
    const missile = this.missile;
    if (missile === null || !missile.isActive()) {
      this.finish();
      return;
    }
    // Target gone (a MIRV that separated, a bomber already shot down).
    if (!this.target.isActive()) {
      this.finish();
      return;
    }
    if (++this.age > MISSILE_LIFETIME) {
      this.resolve(false);
      return;
    }

    const speed = this.isMirv() ? SPEED_VS_MIRV : SPEED_VS_AIRCRAFT;
    const arrived = stepToward(
      this.pos,
      airPositionOf(this.mg, this.target.tile()),
      speed,
    );
    const tile = tileOfAirPosition(this.mg, this.pos);
    if (tile !== missile.tile()) missile.move(tile);
    if (!arrived) return;

    const roll = new PseudoRandom(
      ticks * 7919 + this.target.id() * 104729 + missile.id(),
    ).nextInt(0, 100);
    this.resolve(roll >= INTERCEPT_FAILURE_PERCENT);
  }

  private resolve(hit: boolean): void {
    if (this.isMirv()) {
      engagementOf(this.target).attempts++;
      if (hit) {
        this.target.delete(true, this.owner);
        this.mg.stats().bombIntercept(this.owner, UnitType.MIRV, 1);
      }
      this.mg.displayMessage(
        hit
          ? "events_display.mirv_intercepted"
          : "events_display.mirv_intercept_missed",
        hit ? MessageType.SAM_HIT : MessageType.SAM_MISS,
        this.owner.id(),
      );
    } else if (hit) {
      const damage =
        this.mg.config().unitInfo(UnitType.AAMissile).damage ?? 300;
      if (this.target.health() - damage <= 0) {
        this.target.delete(true, this.owner);
      } else {
        this.target.modifyHealth(-damage, this.owner);
      }
    }
    this.finish();
  }

  /** Free the MIRV for the next interceptor, and remove the missile. */
  private finish(): void {
    if (this.isMirv()) engagementOf(this.target).inFlight = false;
    if (this.missile !== null && this.missile.isActive()) {
      this.missile.delete(false);
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
