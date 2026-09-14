import { canUseSuperforkSystems } from "../configuration/SuperforkUnits";
import { Execution, Game, Player } from "../game/Game";

/** Two minutes at 10 ticks per second, per spec. */
export const CEASEFIRE_DURATION_TICKS = 120 * 10;

/**
 * Propose a ceasefire.
 *
 * Deliberately thinner than an alliance. A ceasefire says "stop fighting for a
 * second": it suppresses land attacks between the parties for two minutes and
 * does nothing else. There is no shared vision, no betrayal penalty when it
 * lapses or when someone attacks the moment it does, and — per spec — no
 * effect on naval combat, which is why it hooks `canAttackPlayer` rather than
 * the warship targeting path.
 *
 * `liberationFor` carries the mediator's optional condition. It is held here
 * and read on acceptance so the two are atomic: you cannot accept the truce
 * and decline the territory it was contingent on.
 */
export class CeasefireProposeExecution implements Execution {
  private active = true;

  constructor(
    private proposer: Player,
    private recipientID: string,
    private liberationFor: string | undefined,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    // Tribes do not negotiate - see canUseSuperforkSystems.
    if (!canUseSuperforkSystems(this.proposer.type())) return;
    if (!mg.hasPlayer(this.recipientID)) return;
    const recipient = mg.player(this.recipientID);
    if (recipient.id() === this.proposer.id()) return;

    // Recorded as a pending offer on the recipient. The UI surfaces it the
    // way alliance requests are surfaced; accepting runs the response
    // execution below.
    pendingCeasefires.set(key(this.proposer, recipient), {
      proposer: this.proposer,
      recipient,
      liberationFor: this.liberationFor,
      createdAt: ticks,
    });
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/** Accept or decline a proposed ceasefire. */
export class CeasefireResponseExecution implements Execution {
  private active = true;

  constructor(
    private recipient: Player,
    private proposerID: string,
    private accept: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.proposerID)) return;
    const proposer = mg.player(this.proposerID);

    const k = key(proposer, this.recipient);
    const offer = pendingCeasefires.get(k);
    if (offer === undefined) return;
    pendingCeasefires.delete(k);
    if (!this.accept) return;

    // Recorded on both sides. canAttackPlayer checks both directions anyway,
    // but storing it symmetrically means either party can see and reason
    // about the truce without asking the other.
    proposer.addCeasefire(this.recipient, CEASEFIRE_DURATION_TICKS);
    this.recipient.addCeasefire(proposer, CEASEFIRE_DURATION_TICKS);

    if (offer.liberationFor !== undefined) {
      liberate(mg, offer.liberationFor, this.recipient, proposer);
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

interface PendingCeasefire {
  proposer: Player;
  recipient: Player;
  liberationFor: string | undefined;
  createdAt: number;
}

/**
 * Outstanding offers, keyed by the unordered pair.
 *
 * Module-level rather than per-game state, which is acceptable only because a
 * worker runs exactly one game. If that ever changes this must move onto
 * GameImpl — noting it here so the assumption is visible rather than
 * discovered.
 */
const pendingCeasefires = new Map<string, PendingCeasefire>();

function key(a: Player, b: Player): string {
  return [a.id(), b.id()].sort().join("|");
}

/** The pending offer between two players, if any. Exposed for the UI. */
export function pendingCeasefireBetween(
  a: Player,
  b: Player,
): PendingCeasefire | undefined {
  return pendingCeasefires.get(key(a, b));
}

/** Clear all pending offers. Called when a game ends. */
export function clearPendingCeasefires(): void {
  pendingCeasefires.clear();
}

/**
 * Liberation.
 *
 * Three parties: a **victim** whose land was taken, an **aggressor** holding
 * it, and a **mediator** who attached the condition to a ceasefire. When the
 * aggressor accepts that ceasefire, every tile they still hold that they took
 * from the victim reverts.
 *
 * The reverting is bounded by construction: `ConquestLedger.takenFrom` returns
 * only tiles the aggressor *currently* holds and *did* take from the victim,
 * so a liberation never hands back ground the aggressor already lost to
 * someone else, and never touches tiles that were always theirs.
 *
 * A dead victim is revived by the transfer, which is the point — liberation is
 * how a conquered nation gets put back on the map.
 */
export function liberate(
  mg: Game,
  victimID: string,
  aggressor: Player,
  mediator: Player,
): number {
  if (!mg.hasPlayer(victimID)) return 0;
  const victim = mg.player(victimID);
  if (victim.id() === aggressor.id()) return 0;

  const tiles = mg.conquestLedger().takenFrom(victim.id(), aggressor.id());
  let restored = 0;
  for (const tile of tiles) {
    // Guard against the ledger and the map disagreeing - the map is the
    // source of truth, the ledger is only an index into it.
    if (mg.owner(tile) !== aggressor) continue;
    victim.conquer(tile);
    restored++;
  }

  if (restored > 0) {
    // The mediator guaranteed the settlement, so it allies the parties it
    // brokered peace between rather than leaving the victim alone with the
    // nation that just invaded them.
    const req = mediator.createAllianceRequest(victim);
    req?.accept();
  }
  return restored;
}
