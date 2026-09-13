import { Execution, Game, Player } from "../game/Game";

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
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
