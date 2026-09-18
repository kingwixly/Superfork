import { translateText } from "../../client/Utils";
import {
  Aircraft,
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  AirPosition,
  airPositionOf,
  stepToward,
  tileOfAirPosition,
} from "./utils/AirMotion";

/** How long an EMP burst leaves structures inert. */
export const EMP_DISABLE_DURATION = 30 * 10; // 30s
/** Blast radii, in tiles. */
export const NEUTRON_RADIUS = 40;
export const EMP_RADIUS = 55;
/** Share of troops a neutron bomb kills inside the radius. */
export const NEUTRON_KILL_SHARE = 0.6;

/**
 * Tiles per tick in flight.
 *
 * Slower than an ASBM warhead: these are area weapons aimed at ground, and the
 * flight time is what gives SAMs, interceptors and warships a chance to engage
 * them. A weapon nothing can stop is not a weapon, it is a button.
 */
export const SPECIAL_WARHEAD_SPEED = 3;

/**
 * Neutron bomb and EMP burst.
 *
 * Both are given their own execution rather than another branch of
 * NukeExecution. That file's `detonate` relinquishes tiles, queues land-to-
 * water conversion and razes structures — it is built around destroying
 * ground, and both of these weapons deliberately leave the ground intact.
 * Extending it would have meant threading "except don't do any of that"
 * through five hundred lines.
 *
 * **Neutron bomb** kills troops and leaves everything standing, so the tile is
 * immediately capturable. It is the inverse of every existing nuke: a *take
 * the ground* weapon rather than a *deny the ground* one.
 *
 * **EMP burst** destroys nothing at all. Structures in radius go inert for
 * thirty seconds and aircraft caught inside are downed. Its value is tempo —
 * a window in which an opponent's air defence and silos cannot answer.
 */
export class SpecialWarheadExecution implements Execution {
  private mg: Game;
  private active = true;
  private warhead: Unit | undefined;
  private pos: AirPosition | undefined;

  constructor(
    private player: Player,
    private type: UnitType.NeutronBomb | UnitType.EMPBomb,
    private target: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;

    // The alert is how a player identifies the weapon - the game announces
    // every inbound warhead by name - so a silent EMP or neutron strike would
    // read as broken. Unlike vanilla's two hardcoded English strings, these go
    // through translateText as CLAUDE.md requires.
    const owner = mg.owner(this.target);
    if (owner.isPlayer() && (owner as Player).id() !== this.player.id()) {
      mg.displayMessage(
        translateText(
          this.type === UnitType.NeutronBomb
            ? "events_display.neutron_inbound"
            : "events_display.emp_inbound",
          { player: this.player.displayName() },
        ),
        MessageType.NUKE_INBOUND,
        (owner as Player).id(),
      );
    }
  }

  tick(ticks: number): void {
    const warhead = this.warhead;

    // Launched but not yet built: put it on the pad.
    if (warhead === undefined) {
      const silo = this.player
        .units(UnitType.MissileSilo)
        .find((u) => u.isActive() && !u.isUnderConstruction());
      const from = silo?.tile() ?? this.target;
      this.warhead = this.player.buildUnit(this.type, from, {
        targetTile: this.target,
        trajectory: [],
      });
      this.pos = airPositionOf(this.mg, from);
      return;
    }

    // Shot down. No detonation - which is the whole point of making these
    // FLY: spawning them at the target and killing them instantly, as the
    // previous version did, meant nothing could ever intercept a neutron
    // bomb or an EMP.
    if (!warhead.isActive()) {
      this.active = false;
      return;
    }

    const pos = this.pos;
    if (pos === undefined) {
      this.active = false;
      return;
    }

    const arrived = stepToward(
      pos,
      airPositionOf(this.mg, this.target),
      SPECIAL_WARHEAD_SPEED,
    );
    warhead.move(tileOfAirPosition(this.mg, pos));
    if (!arrived) return;

    // Marked reached so the FX layer draws a detonation rather than the
    // interception shockwave it uses for warheads killed in flight.
    warhead.setReachedTarget();
    warhead.delete(false);
    this.active = false;

    if (this.type === UnitType.NeutronBomb) {
      this.detonateNeutron();
    } else {
      this.detonateEMP();
    }
  }

  /**
   * Kill troops in radius; touch nothing else.
   *
   * Charged against the owners of the ground rather than everyone nearby, so
   * it reads as "the defenders died" and not as an area-denial weapon.
   */
  private detonateNeutron(): void {
    const owners = new Set<Player>();
    for (const tile of this.mg.bfs(
      this.target,
      (_, t) =>
        this.mg.euclideanDistSquared(this.target, t) <
        NEUTRON_RADIUS * NEUTRON_RADIUS,
    )) {
      const owner = this.mg.owner(tile);
      if (owner.isPlayer()) owners.add(owner as Player);
    }
    for (const owner of owners) {
      if (owner.id() === this.player.id()) continue;
      const killed = Math.floor(owner.troops() * NEUTRON_KILL_SHARE);
      if (killed > 0) owner.removeTroops(killed);
    }
  }

  /** Disable structures in radius and down any aircraft caught inside. */
  private detonateEMP(): void {
    const until = this.mg.ticks() + EMP_DISABLE_DURATION;
    const radius = EMP_RADIUS;

    for (const { unit } of this.mg.nearbyUnits(this.target, radius, [
      UnitType.SAMLauncher,
      UnitType.MissileSilo,
      UnitType.InternationalAirport,
      UnitType.Airstrip,
      UnitType.Airfield,
      UnitType.DefensePost,
    ])) {
      if (unit.owner().id() === this.player.id()) continue;
      unit.disable(until);
    }

    // Aircraft do not survive losing avionics mid-flight.
    for (const { unit } of this.mg.nearbyUnits(this.target, radius, [
      ...Aircraft.types,
    ])) {
      if (unit.owner().id() === this.player.id()) continue;
      unit.delete(true, this.player);
    }
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/** Whether a structure should act this tick. Disabled units do nothing. */
export function isOperational(unit: Unit): boolean {
  return unit.isActive() && !unit.isDisabled();
}
