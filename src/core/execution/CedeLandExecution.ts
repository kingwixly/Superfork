import { canUseSuperforkSystems } from "../configuration/SuperforkUnits";
import { Execution, Game, Player } from "../game/Game";
import { TileRef } from "../game/GameMap";

/**
 * Hand an area of your territory to another nation.
 *
 * Legal toward any other nation: an enemy (a concession or the price of
 * peace), an ally (handing a friend a front or a coastline - per Dani,
 * refusing allies was the wrong call), or a **dead** nation (restoration).
 *
 * Ceding to a dead nation revives it and allies you to it. You brought them
 * back; leaving them hostile at zero territory would just hand your enemy a
 * free neighbour.
 */
export class CedeLandExecution implements Execution {
  private active = true;

  constructor(
    private sender: Player,
    private recipientID: string,
    private tiles: TileRef[],
    private liberate = false,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    // Tribes do not participate in superfork diplomacy - see
    // canUseSuperforkSystems.
    if (!canUseSuperforkSystems(this.sender.type())) return;

    if (!mg.hasPlayer(this.recipientID)) return;
    const recipient = mg.player(this.recipientID);
    if (recipient.id() === this.sender.id()) return;

    if (!CedeLandExecution.canCedeTo(this.sender, recipient)) return;

    // Liberation is cede with the tiles chosen by the ledger rather than by
    // the player: everything the sender still holds that it took from the
    // recipient. Same mechanic, different selection.
    const tiles = this.liberate
      ? mg.conquestLedger().takenFrom(recipient.id(), this.sender.id())
      : this.tiles;

    const wasDead = !recipient.isAlive();
    let ceded = 0;
    for (const tile of tiles) {
      // The map is the source of truth: silently skip anything the sender no
      // longer owns, rather than trusting the tile list that arrived on the
      // wire.
      if (mg.owner(tile) !== this.sender) continue;
      recipient.conquer(tile);
      ceded++;
    }
    if (ceded === 0) return;

    if (wasDead) {
      const req = this.sender.createAllianceRequest(recipient);
      req?.accept();
    }
  }

  /**
   * Whether `sender` may cede to `recipient`.
   *
   * Anyone but yourself.
   */
  static canCedeTo(sender: Player, recipient: Player): boolean {
    return recipient.id() !== sender.id();
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
