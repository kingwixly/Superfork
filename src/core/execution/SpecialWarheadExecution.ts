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

/** How long an EMP burst leaves structures inert. */
export const EMP_DISABLE_DURATION = 30 * 10; // 30s
/** Blast radii, in tiles. */
export const NEUTRON_RADIUS = 40;
export const EMP_RADIUS = 55;
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
    this.active = false;

    // Spawn the warhead AT the target and immediately kill it, marked as
    // having reached its target. The FX layer builds explosions from dead
    // units, so a warhead that never existed as a unit produced no visual at
    // all - which is why these detonations were silent.
    const warhead = this.player.buildUnit(this.type, this.target, {
      targetTile: this.target,
      trajectory: [],
    });
    warhead.setReachedTarget();
    warhead.delete(false);

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
