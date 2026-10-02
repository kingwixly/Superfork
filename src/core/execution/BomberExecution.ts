import { Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AircraftExecution } from "./AircraftExecution";

/** Ticks between bomb runs while over hostile ground. */
export const BOMB_INTERVAL = 25;
/** Radius of a single bomb, in tiles. */
export const BOMB_RADIUS = 6;
/** Share of the defender's troops a bomb kills inside that radius. */
export const BOMB_TROOP_KILL = 0.03;
/** Explosions drawn per bomb run (visual only). */
const BOMB_IMPACTS = 3;
/** Impact offsets within the bomb radius, cycled through per run. */
const IMPACT_PATTERN: readonly [number, number][] = [
  [0, 0],
  [4, 1],
  [-3, 3],
  [2, -4],
  [-5, -1],
  [1, 5],
  [-2, -5],
  [5, -3],
];

/**
 * Bomber.
 *
 * The answer to the flaw playtesting exposed most clearly: every other
 * aircraft only fights aircraft, so an air force was self-referential and
 * nobody had a reason to build the first one. A bomber affects the GROUND,
 * which is what gives air power a point.
 *
 * It carries a weapon nothing else has - a continuous low-radius bomb run
 * while it is over enemy territory. Not a nuke: no structures razed, no
 * terrain destroyed. It grinds troops in the area it overflies, so it is
 * attrition support for a ground push rather than a strike weapon.
 *
 * Its cost is that it is defenceless. No air-to-air weapon, and unlike the
 * interceptor it IS a valid target for destroyers, defense posts and SAMs -
 * so an unescorted bomber over defended ground dies.
 */
export class BomberExecution extends AircraftExecution {
  private lastBomb = 0;

  constructor(
    unit: Unit,
    home: Unit | undefined,
    private target: TileRef,
  ) {
    super(unit, home);
  }

  protected onOrdered(tile: TileRef): void {
    this.target = tile;
    this.destination = tile;
  }

  protected decide(ticks: number): void {
    this.destination ??= this.target;
    this.maybeBomb(ticks);
  }

  /** Bomb whatever hostile ground is underneath, on a cooldown. */
  private maybeBomb(ticks: number): void {
    if (ticks - this.lastBomb < BOMB_INTERVAL) return;

    const tile = this.unit.tile();
    if (tile === undefined) return;

    const owner = this.mg.owner(tile);
    if (!owner.isPlayer()) return;
    const victim = owner as Player;
    if (victim.id() === this.owner().id()) return;
    if (this.owner().isFriendly(victim)) return;

    const killed = Math.floor(victim.troops() * BOMB_TROOP_KILL);
    if (killed > 0) victim.removeTroops(killed);
    this.lastBomb = ticks;
    this.showImpacts(tile, ticks);
  }

  /**
   * Bomb runs had no visual at all - troops just ticked down. The FX layer
   * draws explosions from units that die having reached their target, so
   * drop a few shells across the bomb radius and detonate them at once.
   * Offsets come from the tick so every client draws the same pattern.
   */
  private showImpacts(center: TileRef, ticks: number): void {
    const cx = this.mg.x(center);
    const cy = this.mg.y(center);
    for (let i = 0; i < BOMB_IMPACTS; i++) {
      // Integer offsets only: the simulation must stay deterministic, and
      // trig differs between JS engines.
      const [ox, oy] = IMPACT_PATTERN[(ticks + i * 3) % IMPACT_PATTERN.length];
      const x = cx + ox;
      const y = cy + oy;
      if (!this.mg.isValidCoord(x, y)) continue;
      const shell = this.owner().buildUnit(
        UnitType.Shell,
        this.mg.ref(x, y),
        {},
      );
      shell.setReachedTarget();
      shell.delete(false);
    }
  }

  protected onArrived(): void {
    // Loiter over the target rather than vanishing, so a bomber keeps working
    // until it is shot down or recalled. That is what makes escorting one a
    // decision rather than a formality.
    this.destination = undefined;
  }

  /** Whether `player` holds a base that can launch bombers. */
  static canLaunch(player: Player): boolean {
    return (
      player
        .units(UnitType.Airfield)
        .some((b) => !b.isUnderConstruction() && !b.isDisabled()) ||
      player
        .units(UnitType.InternationalAirport)
        .some((b) => !b.isUnderConstruction() && !b.isDisabled())
    );
  }
}
