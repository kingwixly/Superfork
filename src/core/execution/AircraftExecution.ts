import { canFlyOver } from "../game/Airspace";
import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  AirPosition,
  airDistanceTiles,
  airPositionOf,
  stepToward,
  tileOfAirPosition,
} from "./utils/AirMotion";

/**
 * Shared behaviour for every aircraft.
 *
 * Air position lives here rather than on `UnitImpl` deliberately. Sub-tile
 * precision is only needed by the simulation to step smoothly; the client
 * renders from `unit.tile()` and interpolates. Keeping it in the execution
 * avoids widening the unit update payload on the wire for every aircraft,
 * every tick, for precision nobody downstream reads.
 */
export abstract class AircraftExecution implements Execution {
  protected mg: Game;
  protected active = true;
  protected pos: AirPosition;
  /** Where the aircraft is currently flying. Undefined means hold station. */
  protected destination: TileRef | undefined;

  constructor(
    protected unit: Unit,
    protected home: Unit | undefined,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    const tile = this.unit.tile();
    this.pos = airPositionOf(mg, tile ?? this.home?.tile() ?? 0);
  }

  tick(ticks: number): void {
    if (!this.unit.isActive()) {
      this.active = false;
      return;
    }

    this.decide(ticks);

    if (this.destination !== undefined) {
      const speed = this.mg.config().unitInfo(this.unit.type()).speed ?? 1;
      const arrived = stepToward(
        this.pos,
        airPositionOf(this.mg, this.destination),
        speed,
      );
      const tile = tileOfAirPosition(this.mg, this.pos);
      if (tile !== this.unit.tile()) {
        this.unit.move(tile);
      }
      if (arrived) {
        this.destination = undefined;
        this.onArrived();
      }
    }

    this.enforceAirspace();
  }

  /** Per-tick decision making. Subclasses pick targets and set destination. */
  protected abstract decide(ticks: number): void;

  /** Called the tick the aircraft reaches its destination. */
  protected onArrived(): void {}

  /**
   * An aircraft caught inside airspace closed to it is shot down.
   *
   * Checked at the aircraft's current tile rather than along its whole path:
   * a sanction can be declared mid-flight, and the fair reading is that you
   * are intercepted where you are when the sky closes, not retroactively for
   * a route that was legal when you set out.
   */
  private enforceAirspace(): void {
    const tile = this.unit.tile();
    if (tile === undefined) return;
    if (!canFlyOver(this.mg, this.unit.owner(), tile)) {
      this.unit.delete(true);
      this.active = false;
    }
  }

  /** Distance in tiles from this aircraft to a tile. */
  protected distanceTo(tile: TileRef): number {
    return airDistanceTiles(this.pos, airPositionOf(this.mg, tile));
  }

  /**
   * Whether the aircraft is still inside its home base's operating radius.
   *
   * Range is the base's, not the airframe's: an airstrip's fighters reach less
   * far than an airport's even though it is the same aircraft.
   */
  protected inRangeOfHome(): boolean {
    if (this.home === undefined || !this.home.isActive()) return true;
    const homeTile = this.home.tile();
    if (homeTile === undefined) return true;
    const range = this.mg.config().unitInfo(this.home.type()).range ?? 0;
    return range <= 0 || this.distanceTo(homeTile) <= range;
  }

  /** Send the aircraft back toward its base. */
  protected returnToBase(): void {
    const homeTile = this.home?.tile();
    if (homeTile !== undefined) this.destination = homeTile;
  }

  protected owner(): Player {
    return this.unit.owner();
  }

  protected isHostile(other: Unit): boolean {
    const them = other.owner();
    if (them.id() === this.owner().id()) return false;
    return !this.owner().isFriendly(them);
  }

  /** Aircraft of `types` within `radius`, hostile to this one, nearest first. */
  protected hostileAircraftNear(radius: number, types: UnitType[]): Unit[] {
    const tile = this.unit.tile();
    if (tile === undefined) return [];
    return this.mg
      .nearbyUnits(tile, radius, types)
      .filter(({ unit }) => unit.isActive() && this.isHostile(unit))
      .sort((a, b) => a.distSquared - b.distSquared)
      .map(({ unit }) => unit);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
