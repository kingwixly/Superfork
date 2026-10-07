import {
  BLINDING_DURATION,
  BLINDING_RADIUS,
  BUNKER_BUSTER_RADIUS,
  CAPITAL_STRIKE_LOCKOUT,
  CAPITAL_STRIKE_TROOP_LOSS,
} from "../configuration/SuperforkUnits";
import {
  Execution,
  Game,
  MessageType,
  Player,
  Structures,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  canDemoteCapital,
  demoteCapital,
  lockCapitalPromotion,
} from "./CapitalExecution";
import { EmpRecoveryExecution } from "./SpecialWarheadExecution";

/** Ticks a stealth bomb takes to fall from release to impact. */
export const STEALTH_BOMB_FALL_TICKS = 8;

/** Structures a blinding bomb knocks offline. */
const BLINDED_TYPES: UnitType[] = [UnitType.SAMLauncher, UnitType.MissileSilo];

/**
 * The stealth bomber's two payloads, from release to impact.
 *
 * **Blinding bomb**: destroys nothing. SAM launchers and missile silos in
 * radius go offline for 30 seconds, opening a window for a follow-up
 * strike. That is the point of flying it on the one aircraft SAMs cannot see.
 *
 * **Bunker buster**: a small, precise blast. Every enemy structure in the
 * radius is destroyed; no terrain, fallout or troop losses. A capital is the
 * exception: a plain capital is demoted back to a city, while one locked by a
 * stacked port or airport (which cannot be demoted) is destroyed. Either way
 * the nation loses a quarter of its troops and cannot promote a new capital
 * for two minutes. No other weapon punishes the loss of a capital this way.
 *
 * Neither touches its owner's or allies' buildings.
 */
export class StealthMunitionExecution implements Execution {
  private mg: Game;
  private active = true;
  private bomb: Unit | null = null;
  private fallen = 0;

  constructor(
    private player: Player,
    private type: UnitType.BlindingBomb | UnitType.BunkerBuster,
    private target: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    // Released right over the target, like a gravity bomb.
    this.bomb = this.player.buildUnit(
      this.type,
      this.target,
      { targetTile: this.target },
      { free: true },
    );
  }

  tick(ticks: number): void {
    const bomb = this.bomb;
    if (bomb === null || !bomb.isActive()) {
      this.active = false;
      return;
    }
    if (++this.fallen < STEALTH_BOMB_FALL_TICKS) return;

    // Marked reached so the FX layer draws a detonation.
    bomb.setReachedTarget();
    bomb.delete(false);
    this.active = false;
    if (this.type === UnitType.BlindingBomb) {
      this.blind();
    } else {
      this.bust();
    }
  }

  private spares(unit: Unit): boolean {
    const owner = unit.owner();
    return owner === this.player || this.player.isFriendly(owner);
  }

  private blind(): void {
    const until = this.mg.ticks() + BLINDING_DURATION;
    const hit: Unit[] = [];
    const victims = new Set<Player>();
    for (const { unit } of this.mg.nearbyUnits(
      this.target,
      BLINDING_RADIUS,
      BLINDED_TYPES,
    )) {
      if (this.spares(unit)) continue;
      unit.disable(until);
      hit.push(unit);
      victims.add(unit.owner());
    }
    if (hit.length > 0) {
      this.mg.addExecution(new EmpRecoveryExecution(hit, until));
    }
    for (const victim of victims) {
      this.mg.displayMessage(
        "events_display.blinding_bomb_hit",
        MessageType.NUKE_DETONATED,
        victim.id(),
        undefined,
        { player: this.player.displayName() },
      );
    }
  }

  private bust(): void {
    const struck = this.mg
      .nearbyUnits(this.target, BUNKER_BUSTER_RADIUS, [...Structures.types])
      .map(({ unit }) => unit)
      .filter((unit) => unit.isActive() && !this.spares(unit));

    // Capitals first: whether one can be demoted depends on what is stacked
    // on it, and the blast is about to destroy those stacked buildings.
    for (const capital of struck.filter((u) => u.type() === UnitType.Capital)) {
      const victim = capital.owner();
      if (canDemoteCapital(this.mg, capital)) {
        demoteCapital(this.mg, capital);
      } else {
        capital.delete(true, this.player);
      }
      const lost = Math.floor(victim.troops() * CAPITAL_STRIKE_TROOP_LOSS);
      if (lost > 0) victim.removeTroops(lost);
      lockCapitalPromotion(victim, this.mg.ticks() + CAPITAL_STRIKE_LOCKOUT);
      this.mg.displayMessage(
        "events_display.capital_struck",
        MessageType.NUKE_DETONATED,
        victim.id(),
        undefined,
        { player: this.player.displayName() },
      );
    }

    for (const unit of struck) {
      if (unit.type() === UnitType.Capital || !unit.isActive()) continue;
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
