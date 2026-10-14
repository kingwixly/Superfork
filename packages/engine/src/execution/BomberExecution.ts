import { TileRef } from "@openfront/engine-api/game/GameMap";
import { PlayerID, UnitType } from "@openfront/engine-api/game/GameTypes";
import { Game, Player, Unit } from "../game/Game";
import { AircraftExecution } from "./AircraftExecution";

/** Ticks between bomb runs while over hostile ground. */
export const BOMB_INTERVAL = 25;
/** Radius of a single bomb, in tiles. */
export const BOMB_RADIUS = 6;
/**
 * Share of the troops stationed inside a bomb's radius that it kills. Troops
 * are one pool per nation, so "stationed there" is the nation's troops times
 * the share of its land the bomb covers. The old rule took 3% of the WHOLE
 * army per bomb, forever, and erased armies in a minute or two.
 */
export const BOMB_TROOP_KILL = 0.35;
/** Tiles one bomb covers (a radius-6 disc). */
export const BOMB_AREA_TILES = 113;
/** Bombs per sortie; then the bomber flies home to re-arm. */
export const BOMBS_PER_SORTIE = 8;
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
  /** The nation being bombed: whoever owned the ordered tile. */
  private targetOwner: PlayerID | null = null;
  private bombs = BOMBS_PER_SORTIE;
  /** Re-armed at base and waiting for a new order. */
  private idle = false;

  constructor(
    unit: Unit,
    home: Unit | undefined,
    private target: TileRef,
  ) {
    super(unit, home);
  }

  init(mg: Game, ticks: number): void {
    super.init(mg, ticks);
    this.aimAt(this.target);
  }

  protected onOrdered(tile: TileRef): void {
    this.target = tile;
    this.destination = tile;
    this.idle = false;
    this.aimAt(tile);
  }

  /** Only the nation that owns the ordered tile is bombed - never anyone else. */
  private aimAt(tile: TileRef): void {
    const owner = this.mg.owner(tile);
    this.targetOwner = owner.isPlayer() ? (owner as Player).id() : null;
  }

  protected decide(ticks: number): void {
    if (this.bombs <= 0) {
      // Out of bombs: home to re-arm, then wait for the next order.
      const homeTile = this.home?.tile();
      if (homeTile === undefined || this.distanceTo(homeTile) <= 1) {
        this.bombs = BOMBS_PER_SORTIE;
        this.destination = undefined;
        this.idle = true;
        return;
      }
      this.destination = homeTile;
      return;
    }
    if (this.idle) return;
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
    // Only the ordered target, and never yourself or a friend (an alliance
    // can be signed mid-flight).
    if (victim.id() !== this.targetOwner) return;
    if (victim.id() === this.owner().id()) return;
    if (this.owner().isFriendly(victim)) return;

    const share = Math.min(
      1,
      BOMB_AREA_TILES / Math.max(1, victim.numTilesOwned()),
    );
    const killed = Math.floor(victim.troops() * share * BOMB_TROOP_KILL);
    if (killed > 0) victim.removeTroops(killed);
    this.lastBomb = ticks;
    this.bombs--;
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
