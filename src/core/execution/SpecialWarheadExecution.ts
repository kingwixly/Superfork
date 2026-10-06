import { translateText } from "../../client/Utils";
import { EMP_RADIUS, NEUTRON_RADIUS } from "../configuration/SuperforkUnits";
import {
  Aircraft,
  Execution,
  Game,
  MessageType,
  Player,
  Structures,
  TrajectoryTile,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { UniversalPathFinding } from "../pathfinding/PathFinder";
import { ParabolaUniversalPathFinder } from "../pathfinding/PathFinder.Parabola";
import { PathStatus } from "../pathfinding/types";

/** How long an EMP burst leaves structures inert. */
export const EMP_DISABLE_DURATION = 30 * 10; // 30s
// Blast radii live in SuperforkUnits so Config (and the client) can read
// them without importing an execution.
export { EMP_RADIUS, NEUTRON_RADIUS };
/** Share of troops a neutron bomb kills inside the radius. */
export const NEUTRON_KILL_SHARE = 0.6;

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
  private src: TileRef | undefined;
  private pathFinder: ParabolaUniversalPathFinder;
  private speed = 0;

  constructor(
    private player: Player,
    private type: UnitType.NeutronBomb | UnitType.EMPBomb,
    private target: TileRef,
    private rocketDirectionUp = true,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    // Same arc and speed as an atom bomb, so they read as missiles from a
    // silo rather than something that crawls across the map.
    this.speed = mg.config().nukeSpeed(UnitType.AtomBomb);
    this.pathFinder = UniversalPathFinding.Parabola(mg, {
      increment: this.speed,
      directionUp: this.rocketDirectionUp,
    });

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
    // Launch: from a ready silo, exactly like a nuke. These used to fall
    // back to spawning AT the target when there was no silo, so without one
    // the player saw a blast and no missile at all.
    if (this.warhead === undefined) {
      const spawn = this.player.canBuild(this.type, this.target);
      if (spawn === false) {
        this.active = false;
        return;
      }
      this.src = spawn;
      this.warhead = this.player.buildUnit(this.type, spawn, {
        targetTile: this.target,
        trajectory: this.trajectory(),
      });
      this.player
        .units(UnitType.MissileSilo)
        .find((silo) => silo.tile() === spawn)
        ?.launch();
      return;
    }

    // Shot down. No detonation - the point of making these fly is that SAMs,
    // interceptors and warships get a chance at them.
    const warhead = this.warhead;
    if (!warhead.isActive()) {
      this.active = false;
      return;
    }

    const result = this.pathFinder.next(this.src!, this.target, this.speed);
    if (result.status === PathStatus.NEXT) {
      warhead.move(result.node);
      warhead.setTrajectoryIndex(this.pathFinder.currentIndex());
      warhead.setTargetable(this.targetable(warhead.tile()));
      return;
    }
    if (result.status !== PathStatus.COMPLETE) {
      // No path: nothing sensible to do but fizzle.
      warhead.delete(false);
      this.active = false;
      return;
    }
    warhead.move(result.node);

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

  /** Same targetable window as a nuke: near launch and near impact. */
  private targetable(tile: TileRef): boolean {
    const r2 = this.mg.config().defaultNukeTargetableRange() ** 2;
    return (
      this.mg.euclideanDistSquared(tile, this.target) < r2 ||
      (this.src !== undefined &&
        this.mg.euclideanDistSquared(this.src, tile) < r2)
    );
  }

  private trajectory(): TrajectoryTile[] {
    const tiles = this.pathFinder.findPath(this.src!, this.target) ?? [];
    return tiles.map((tile) => ({ tile, targetable: this.targetable(tile) }));
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

    // Every structure, not a short list: the list skipped cities, ports,
    // factories and banks, so an EMP on an economy did nothing visible.
    const hit: Unit[] = [];
    for (const { unit } of this.mg.nearbyUnits(this.target, radius, [
      ...Structures.types,
      UnitType.Carrier,
    ])) {
      if (unit.owner().id() === this.player.id()) continue;
      unit.disable(until);
      hit.push(unit);
    }
    // isDisabled() is computed from the clock, but clients only learn about a
    // unit when it changes - so nudge each one again when the burst wears off.
    if (hit.length > 0) {
      this.mg.addExecution(new EmpRecoveryExecution(hit, until));
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

/** Re-sends EMP'd units to clients on the tick they come back online. */
class EmpRecoveryExecution implements Execution {
  private mg: Game;
  private active = true;
  constructor(
    private units: Unit[],
    private until: number,
  ) {}
  init(mg: Game): void {
    this.mg = mg;
  }
  tick(): void {
    if (this.mg.ticks() < this.until) return;
    for (const u of this.units) {
      if (u.isActive()) u.disable(0);
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

/** Whether a structure should act this tick. Disabled units do nothing. */
export function isOperational(unit: Unit): boolean {
  return unit.isActive() && !unit.isDisabled();
}
