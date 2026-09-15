import { canUseSuperforkSystems } from "../configuration/SuperforkUnits";
import { Execution, Game, MessageType, Player } from "../game/Game";

/**
 * Start or lift a sanction.
 *
 * Sanctions are unilateral and need no agreement — that is the point of them.
 * The effects are spread across three systems, each hooked at its own natural
 * choke point rather than being reimplemented here:
 *
 *  - **Trade, trains and shipping** — `PlayerImpl.canTrade`, which every trade
 *    ship, train, port pairing and AI decision already consults.
 *  - **Airspace** — `Airspace.canFlyOver`, which closes the sanctioner's sky
 *    to the target and shoots down anything of theirs caught inside it.
 *  - **Civilian flights** — `acceptsCivilianFlightsFrom`, where a sanction
 *    overrides even a fully open border policy.
 *
 * So this execution only manages the state; the systems above read it.
 */
export class SanctionExecution implements Execution {
  private active = true;

  constructor(
    private sanctioner: Player,
    private targetID: string,
    private action: "start" | "stop",
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    // Tribes do not participate in superfork diplomacy - see
    // canUseSuperforkSystems.
    if (!canUseSuperforkSystems(this.sanctioner.type())) return;

    if (!mg.hasPlayer(this.targetID)) {
      console.warn(`sanction: no such player ${this.targetID}`);
      return;
    }
    const target = mg.player(this.targetID);
    if (target.id() === this.sanctioner.id()) return;

    if (this.action === "start") {
      this.sanctioner.addSanction(target);
    } else {
      this.sanctioner.stopSanction(target);
    }

    // Both sides are told. A sanction has no visual representation anywhere in
    // the UI, so without a message the player cannot tell a working button
    // from a dead one - which is exactly how this shipped.
    const key =
      this.action === "start"
        ? "events_display.sanction_started"
        : "events_display.sanction_lifted";
    mg.displayMessage(
      key,
      MessageType.ALLIANCE_BROKEN,
      this.sanctioner.id(),
      undefined,
      {
        player: target.displayName(),
      },
    );
    mg.displayMessage(
      key + "_against",
      MessageType.ALLIANCE_BROKEN,
      target.id(),
      undefined,
      { player: this.sanctioner.displayName() },
    );
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
