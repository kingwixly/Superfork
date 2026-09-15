import { Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AircraftExecution } from "./AircraftExecution";
import { AttackExecution } from "./AttackExecution";

/**
 * Military transport jet.
 *
 * The air counterpart to a transport boat, with two deliberate differences
 * from it:
 *
 *  - **Twice the speed.** A boat is ~1 tile/tick; this is 2. Air assault is
 *    the fast option.
 *  - **Launch from a base only.** Boats launch from whatever coastline sits
 *    nearest the target, which makes them nearly free to position. Transport
 *    jets launch only from an Airfield, so the reach of an air assault is
 *    decided when you build — and paid for up front, since an airfield is the
 *    dearest of the three bases.
 *
 * Landing reuses the boat's semantics: friendly ground reinforces, hostile
 * ground starts an AttackExecution. Diverging here would mean two different
 * answers to "what happens when troops arrive", which is a balance problem
 * rather than a feature.
 */
/**
 * Beachhead size for an air assault, in tiles.
 *
 * Small enough that it is not a free conquest, large enough that the defender
 * cannot erase it with a single tick of border pressure.
 */
const LANDING_RADIUS = 4;
const MAX_LANDING_TILES = 40;

export class TransportJetExecution extends AircraftExecution {
  private landed = false;

  constructor(
    unit: Unit,
    home: Unit | undefined,
    private target: TileRef,
    private attacker: Player,
  ) {
    super(unit, home);
  }

  protected decide(ticks: number): void {
    if (this.landed) return;
    this.destination ??= this.target;
  }

  protected onArrived(): void {
    if (this.landed) return;
    this.landed = true;

    // Second guard, independent of canBuild. conquer() throws on water and
    // that exception kills the worker, so this must never be reachable by any
    // route - not just the one the build menu uses.
    if (!this.mg.isLand(this.target)) {
      this.unit.delete(false);
      this.active = false;
      return;
    }

    const troops = this.unit.troops();
    const owner = this.mg.owner(this.target);

    if (owner.isPlayer() && this.attacker.isFriendly(owner as Player)) {
      // Reinforcement: troops join the defender rather than fighting them.
      this.attacker.addTroops(troops);
    } else if (owner === this.attacker) {
      this.attacker.addTroops(troops);
    } else {
      // Seize a BEACHHEAD, not a single tile. Landing on one tile meant the
      // defender retook it instantly and the assault achieved nothing but a
      // declaration of war - testers had to spam-click to get anywhere.
      // A boat landing gets a whole coastline; an air assault should get
      // comparable ground.
      let seized = 0;
      for (const tile of this.mg.bfs(
        this.target,
        (_, t) =>
          this.mg.isLand(t) &&
          this.mg.euclideanDistSquared(this.target, t) <=
            LANDING_RADIUS * LANDING_RADIUS,
      )) {
        const tileOwner = this.mg.owner(tile);
        if (tileOwner === this.attacker) continue;
        this.attacker.conquer(tile);
        seized++;
        if (seized >= MAX_LANDING_TILES) break;
      }

      this.mg.addExecution(
        new AttackExecution(
          troops,
          this.attacker,
          owner.isPlayer() ? (owner as Player).id() : null,
          this.target,
          false,
        ),
      );
    }

    this.unit.delete(false);
    this.active = false;
  }

  /**
   * Whether `player` can mount an air assault on `target` at all.
   *
   * True only if they hold an active Airfield within its own operating radius
   * of the target. This is the launch-from-base rule, and it is what stops air
   * transport from simply replacing boats.
   */
  static canLaunchAgainst(
    mg: Game,
    player: Player,
    target: TileRef,
  ): Unit | undefined {
    const range = mg.config().unitInfo(UnitType.Airfield).range ?? 0;
    return player
      .units(UnitType.Airfield)
      .filter((base) => !base.isUnderConstruction())
      .find((base) => {
        const tile = base.tile();
        if (tile === undefined) return false;
        return mg.manhattanDist(tile, target) <= range;
      });
  }
}
