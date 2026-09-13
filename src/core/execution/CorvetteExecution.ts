import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AttackExecution } from "./AttackExecution";

/**
 * Corvette.
 *
 * "Land on sea": a cheap, individually weak hull whose point is that troops
 * can be loaded onto it and deployed from it. That turns a fleet of them into
 * a forward staging area, letting an invasion start from open water rather
 * than from your own coastline.
 *
 * Three rules shape it:
 *
 *  - **Allies can load it too.** A corvette is a platform, not just a unit, so
 *    an ally can stage troops on yours. That is what makes a joint landing
 *    possible without ceding territory first.
 *  - **It may only deploy when it is closer to the target than any land you
 *    own.** Otherwise it would simply be a better boat, launching from
 *    wherever is convenient. The rule keeps it an *extender* of reach rather
 *    than a replacement for coastal staging.
 *  - **It is weak alone.** Cheapest hull in the fleet and the lowest health of
 *    the three combat ships; the design intent is swarms, so a lone corvette
 *    losing to a destroyer is correct.
 */
export class CorvetteExecution implements Execution {
  private mg: Game;
  private active = true;

  constructor(private corvette: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.corvette.isActive()) {
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  /**
   * Whether `sender` may load troops onto this corvette.
   *
   * The owner always may; allies may too, which is what lets two nations
   * stage a joint landing without one first ceding ground to the other.
   */
  static canLoad(corvette: Unit, sender: Player): boolean {
    if (!corvette.isActive() || corvette.type() !== UnitType.Corvette) {
      return false;
    }
    const owner = corvette.owner();
    return owner.id() === sender.id() || owner.isFriendly(sender);
  }

  /**
   * Move troops from `sender` onto the corvette, returning how many moved.
   *
   * Capped by the hull's capacity so a single corvette cannot absorb an army;
   * the intended answer to "I need more lift" is more corvettes.
   */
  static load(
    mg: Game,
    corvette: Unit,
    sender: Player,
    troops: number,
  ): number {
    if (!CorvetteExecution.canLoad(corvette, sender)) return 0;

    // Capacity is expressed as a share of the owner's maximum army, so a
    // corvette lifts a meaningful slice of a small nation and a modest one of
    // a large empire, rather than a flat number that is either useless late
    // or overwhelming early.
    const share = mg.config().unitInfo(UnitType.Corvette).troopCapacity ?? 0;
    const perHull = Math.floor(mg.config().maxTroops(sender) * share * 0.1);
    const room = Math.max(0, perHull - corvette.troops());
    const moved = Math.min(room, sender.troops(), Math.max(0, troops));
    if (moved <= 0) return 0;

    sender.removeTroops(moved);
    corvette.setTroops(corvette.troops() + moved);
    return moved;
  }

  /**
   * Whether this corvette is closer to `target` than any land its owner holds.
   *
   * This is the rule that stops corvettes from being strictly better boats. A
   * corvette extends reach past your coastline; it does not replace launching
   * from it.
   */
  static isClosestStagingPoint(
    mg: Game,
    corvette: Unit,
    target: TileRef,
  ): boolean {
    const tile = corvette.tile();
    if (tile === undefined) return false;
    const ownDist = mg.manhattanDist(tile, target);

    let closestLand = Number.POSITIVE_INFINITY;
    for (const unit of corvette.owner().units(UnitType.Port)) {
      const portTile = unit.tile();
      if (portTile === undefined) continue;
      closestLand = Math.min(closestLand, mg.manhattanDist(portTile, target));
    }
    return ownDist < closestLand;
  }

  /**
   * Land this corvette's troops on `target`.
   *
   * Reuses the boat's landing semantics: friendly ground reinforces, hostile
   * ground starts an AttackExecution. Returns false when the staging rule
   * refuses the launch.
   */
  static deploy(mg: Game, corvette: Unit, target: TileRef): boolean {
    if (!corvette.isActive() || corvette.troops() <= 0) return false;
    if (!CorvetteExecution.isClosestStagingPoint(mg, corvette, target)) {
      return false;
    }

    const attacker = corvette.owner();
    const troops = corvette.troops();
    const owner = mg.owner(target);

    if (owner === attacker) {
      attacker.addTroops(troops);
    } else if (owner.isPlayer() && attacker.isFriendly(owner as Player)) {
      attacker.addTroops(troops);
    } else {
      attacker.conquer(target);
      mg.addExecution(
        new AttackExecution(
          troops,
          attacker,
          owner.isPlayer() ? (owner as Player).id() : null,
          target,
          false,
        ),
      );
    }

    // The hull survives the landing — unlike a transport, a corvette is a
    // reusable platform, which is what justifies its price over a boat.
    corvette.setTroops(0);
    return true;
  }
}
