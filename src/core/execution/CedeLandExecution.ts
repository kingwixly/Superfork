import { Execution, Game, Player } from "../game/Game";
import { TileRef } from "../game/GameMap";

/**
 * Hand an area of your territory to another nation.
 *
 * Restricted on purpose. Ceding is a diplomatic instrument — buying peace,
 * paying a debt, putting a defeated nation back on the map — not a way to
 * quietly shuffle territory between friends. So it is only legal toward:
 *
 *  - a nation you are **at war with**, where it reads as a concession, or
 *  - a **dead** nation, where it reads as restoration.
 *
 * Ceding to an ally is deliberately refused: allies can already coordinate
 * freely, and allowing it would make territory fungible between them.
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
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;

    if (!mg.hasPlayer(this.recipientID)) return;
    const recipient = mg.player(this.recipientID);
    if (recipient.id() === this.sender.id()) return;

    if (!CedeLandExecution.canCedeTo(this.sender, recipient)) return;

    const wasDead = !recipient.isAlive();
    let ceded = 0;
    for (const tile of this.tiles) {
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
   * See the class comment for why allies are excluded.
   */
  static canCedeTo(sender: Player, recipient: Player): boolean {
    if (recipient.id() === sender.id()) return false;
    if (!recipient.isAlive()) return true;
    return !sender.isFriendly(recipient);
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
