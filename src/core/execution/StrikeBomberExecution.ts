import { Game, MessageType, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  bomberFor,
  idleStrikeBomber,
  payloadFor,
  registerStrikeBomber,
  StrikeBomberControl,
  StrikeBomberType,
  StrikeOrder,
  StrikePayload,
} from "../game/StrikeBombers";
import { AircraftExecution } from "./AircraftExecution";
import { NukeExecution } from "./NukeExecution";
import { StealthMunitionExecution } from "./StealthMunitionExecution";

/** How close, in tiles, a bomber gets before releasing. */
export const RELEASE_DISTANCE = 1;
/** Ticks a large bomber's bomb falls before it goes off. */
export const LARGE_BOMB_FALL_TICKS = 12;
/** The target is warned once an inbound large bomber is this close. */
export const LARGE_BOMBER_WARNING_DISTANCE = 60;

/**
 * Stealth bomber and large bomber (Phase 39).
 *
 * Both are reusable strategic bombers. They wait at their base until a
 * strike order arrives, fly to the target, release one payload straight
 * down, and fly home to wait for the next order.
 *
 * **Stealth bomber**: SAMs, destroyers and defense posts cannot see it, so
 * only interceptors can stop it. Carries a blinding bomb or a bunker
 * buster. No warning: being unseen is the point.
 *
 * **Large bomber**: drops ordinary atom or hydrogen bombs. Visible to every
 * form of air defence, and volatile: shot down while still loaded, its bomb
 * goes off where it falls.
 */
export class StrikeBomberExecution
  extends AircraftExecution
  implements StrikeBomberControl
{
  private payload: StrikePayload | null = null;
  private target: TileRef | null = null;
  private warned = false;
  private lastTile: TileRef;

  constructor(unit: Unit, home: Unit | undefined) {
    super(unit, home);
    this.lastTile = unit.tile();
    // Registered at once, so an order in the same tick sees it.
    registerStrikeBomber(this);
  }

  bomber(): Unit {
    return this.unit;
  }

  busy(): boolean {
    return this.payload !== null;
  }

  assign(payload: StrikePayload, target: TileRef): void {
    this.payload = payload;
    this.target = target;
    this.warned = false;
    this.destination = target;
  }

  tick(ticks: number): void {
    if (!this.unit.isActive()) {
      this.onLost();
      this.active = false;
      return;
    }
    super.tick(ticks);
    if (this.unit.isActive()) this.lastTile = this.unit.tile();
  }

  /** Strike orders are the only orders a strategic bomber takes. */
  protected onOrdered(tile: TileRef): void {}

  protected decide(ticks: number): void {
    if (this.payload === null || this.target === null) {
      this.goHome();
      return;
    }
    const target = this.target;
    this.destination = target;
    const dist = this.distanceTo(target);

    if (
      !this.warned &&
      this.unit.type() === UnitType.LargeBomber &&
      dist <= LARGE_BOMBER_WARNING_DISTANCE
    ) {
      this.warned = true;
      this.warn(target);
    }

    if (dist <= RELEASE_DISTANCE) {
      this.release(this.payload, target);
      this.payload = null;
      this.target = null;
      this.goHome();
    }
  }

  protected onArrived(): void {
    // Parked at base, or over the target this tick: decide() handles both.
    this.destination = undefined;
  }

  private release(payload: StrikePayload, target: TileRef): void {
    const owner = this.owner();
    if (
      payload === UnitType.BlindingBomb ||
      payload === UnitType.BunkerBuster
    ) {
      this.mg.addExecution(
        new StealthMunitionExecution(owner, payload, target),
      );
      return;
    }
    this.mg.addExecution(
      new NukeExecution(
        payload,
        owner,
        target,
        target,
        -1,
        LARGE_BOMB_FALL_TICKS,
        true,
        true,
      ),
    );
  }

  /** A loaded large bomber that goes down takes its bomb with it. */
  private onLost(): void {
    const payload = this.payload;
    this.payload = null;
    this.target = null;
    if (this.unit.type() !== UnitType.LargeBomber) return;
    if (payload !== UnitType.AtomBomb && payload !== UnitType.HydrogenBomb) {
      return;
    }
    const tile = this.lastTile;
    if (this.mg.isImpassable(tile)) return;
    this.mg.addExecution(
      new NukeExecution(payload, this.owner(), tile, tile, -1, 0, true, true),
    );
  }

  private warn(target: TileRef): void {
    const owner = this.mg.owner(target);
    if (!owner.isPlayer()) return;
    const victim = owner as Player;
    if (victim === this.owner()) return;
    this.mg.displayMessage(
      "events_display.large_bomber_inbound",
      MessageType.NUKE_INBOUND,
      victim.id(),
      undefined,
      { player: this.owner().displayName() },
      this.unit.id(),
    );
  }

  /**
   * Fly back to base, finding a new one when the old base is gone. With no
   * base at all the bomber simply waits where it is; it can still be sent
   * on another strike from there.
   */
  private goHome(): void {
    if (this.home === undefined || !this.home.isActive()) {
      this.home = this.nearestBase();
    }
    const homeTile = this.home?.tile();
    if (homeTile === undefined) {
      this.destination = undefined;
      return;
    }
    if (this.unit.tile() === homeTile) {
      this.destination = undefined;
      return;
    }
    this.destination = homeTile;
  }

  private nearestBase(): Unit | undefined {
    let best: Unit | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const base of [
      ...this.owner().units(UnitType.Airfield),
      ...this.owner().units(UnitType.InternationalAirport),
    ]) {
      if (!base.isActive() || base.isUnderConstruction()) continue;
      const d = this.mg.manhattanDist(base.tile(), this.unit.tile());
      if (d < bestDist) {
        bestDist = d;
        best = base;
      }
    }
    return best;
  }
}

/**
 * Carry out a strike order: hand it to an idle bomber of the right kind, or
 * buy a new one at the nearest capable base. Charges the payload, plus the
 * airframe when a new bomber is bought. Returns false if nothing could fly.
 */
export function orderAirStrike(
  mg: Game,
  player: Player,
  order: StrikeOrder,
  target: TileRef,
): boolean {
  if (player.canBuild(order, target) === false) return false;
  const bomberType: StrikeBomberType = bomberFor(order);
  const payload = payloadFor(order);
  // The order's price: payload, plus an airframe if none is free. Taken
  // before anything is bought, since buying one makes it free.
  const total = mg.unitInfo(order).cost(mg, player);

  let bomber: StrikeBomberControl | null = idleStrikeBomber(
    mg,
    player,
    bomberType,
    target,
  );
  let charge = total;
  if (bomber === null) {
    const spawn = player.canBuild(bomberType, target);
    if (spawn === false) return false;
    const base = [
      ...player.units(UnitType.Airfield),
      ...player.units(UnitType.InternationalAirport),
    ].find((b) => b.tile() === spawn);
    // buildUnit charges the airframe (and records the purchase, which the
    // large bomber's rising price counts).
    charge -= mg.unitInfo(bomberType).cost(mg, player);
    const unit = player.buildUnit(bomberType, spawn, { homeBase: base });
    const exec = new StrikeBomberExecution(unit, base);
    mg.addExecution(exec);
    bomber = exec;
  }
  if (charge > 0n) player.removeGold(charge);
  bomber.assign(payload, target);
  return true;
}
