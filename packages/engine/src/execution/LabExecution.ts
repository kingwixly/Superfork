import { MessageType } from "@openfront/engine-api/game/GameTypes";
import {
  GOVERNMENT_SWITCH_COOLDOWN,
  GOVERNMENT_TRANSITION_TICKS,
  GovernmentId,
  LAB_RP_PER_LEVEL,
  MAX_RP_PER_MATCH,
  RP_INTERVAL,
} from "@openfront/engine-api/game/Progression";
import { Execution, Game, Player, Unit } from "../game/Game";
import type { ExecRecord } from "../snapshot/SnapshotContext";
import { unsnapshottable } from "../snapshot/Unsnapshottable";

/**
 * A lab makes research points for its owner: LAB_RP_PER_LEVEL per level
 * every RP_INTERVAL ticks, scaled by the owner's research multiplier
 * (government, buffs). Disabled (EMP'd) labs make nothing. What a player
 * makes in a match is banked to their research tree afterwards, up to
 * MAX_RP_PER_MATCH.
 */
export class LabExecution implements Execution {
  snapshot(): ExecRecord {
    return unsnapshottable("LabExecution");
  }

  private active = true;
  private mg: Game;
  /** Fractional points carried between payouts. */
  private carry = 0;

  constructor(private lab: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.lab.isActive()) {
      this.active = false;
      return;
    }
    if (this.lab.isUnderConstruction() || this.lab.isDisabled()) return;
    if (ticks % RP_INTERVAL !== 0) return;
    const owner = this.lab.owner();
    if (owner.researchPoints() >= MAX_RP_PER_MATCH) return;
    this.carry +=
      LAB_RP_PER_LEVEL * this.lab.level() * owner.effects().research;
    const whole = Math.floor(this.carry);
    if (whole <= 0) return;
    this.carry -= whole;
    owner.addResearchPoints(
      Math.min(whole, MAX_RP_PER_MATCH - owner.researchPoints()),
    );
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/**
 * Change government. Only to one the player has unlocked, not again within
 * the cooldown, and the new one only takes effect after a transition (until
 * then the nation runs without any government bonus or penalty).
 */
export class SetGovernmentExecution implements Execution {
  snapshot(): ExecRecord {
    return unsnapshottable("SetGovernmentExecution");
  }

  private active = true;

  constructor(
    private player: Player,
    private government: GovernmentId,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    const p = this.player;
    if (!p.isAlive() || p.government() === this.government) return;
    if (!p.governmentUnlocked(this.government)) return;
    if (ticks - p.governmentChangedAt() < GOVERNMENT_SWITCH_COOLDOWN) {
      mg.displayMessage(
        "events_display.government_cooldown",
        MessageType.ALLIANCE_REJECTED,
        p.id(),
      );
      return;
    }
    // The first pick, in the opening minute, is immediate.
    const first = p.governmentChangedAt() === -Infinity && ticks < 600 + mg.config().numSpawnPhaseTurns();
    p.setGovernment(
      this.government,
      first ? ticks : ticks + GOVERNMENT_TRANSITION_TICKS,
    );
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
