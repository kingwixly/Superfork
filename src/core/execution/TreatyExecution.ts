import { canUseSuperforkSystems } from "../configuration/SuperforkUnits";
import { Execution, Game, MessageType, Player } from "../game/Game";

/** Members at creation (including the founder), and the hard ceiling. */
export const TREATY_FOUNDING_SIZE = 3;
export const TREATY_MAX_SIZE = 5;

/**
 * Treaties: multi-party alliances.
 *
 * Vanilla alliances are strictly pairwise, so a bloc of five needs ten
 * separate agreements and every new member has to negotiate with everyone
 * already inside. A treaty is the grouping layer that removes that: you join
 * the treaty, not each member.
 *
 * **It does not reimplement friendliness.** Joining materialises pairwise
 * alliances between the joiner and every existing member, so `isFriendly`,
 * betrayal, shared vision and every other consumer of alliances keeps working
 * untouched. The treaty owns membership; the alliance system still owns what
 * membership *means*.
 *
 * Leaving breaks only that member's pairwise alliances. The remaining members
 * stay allied to each other, which is what makes a treaty a bloc rather than a
 * house of cards.
 */
export class Treaty {
  private members: Player[] = [];

  constructor(
    readonly id: string,
    founder: Player,
  ) {
    this.members.push(founder);
  }

  getMembers(): Player[] {
    return [...this.members];
  }

  has(player: Player): boolean {
    return this.members.some((m) => m.id() === player.id());
  }

  isFull(): boolean {
    return this.members.length >= TREATY_MAX_SIZE;
  }

  /** Add a member and ally them to everyone already inside. */
  add(player: Player): boolean {
    if (this.has(player) || this.isFull() || !player.isAlive()) return false;
    for (const existing of this.members) {
      if (existing.isFriendly(player)) continue;
      const req = existing.createAllianceRequest(player);
      req?.accept();
    }
    this.members.push(player);
    return true;
  }

  /** Remove a member, breaking only their own pairwise alliances. */
  remove(player: Player): boolean {
    const i = this.members.findIndex((m) => m.id() === player.id());
    if (i < 0) return false;
    this.members.splice(i, 1);
    for (const other of this.members) {
      const alliance = player.allianceWith(other);
      // expire() rather than breakAlliance(): leaving a treaty is not
      // treachery, so it must not set the traitor flag.
      alliance?.expire();
    }
    return true;
  }
}

/**
 * Live treaties.
 *
 * Module-level for the same reason the ceasefire offers are, and with the same
 * caveat: safe only because a worker runs one game. Move onto GameImpl if that
 * ever changes.
 */
const treaties = new Map<string, Treaty>();

export function getTreaty(id: string): Treaty | undefined {
  return treaties.get(id);
}

export function treatiesOf(player: Player): Treaty[] {
  return [...treaties.values()].filter((t) => t.has(player));
}

export function clearTreaties(): void {
  treaties.clear();
  pendingInvites.clear();
}

/** Create a treaty with the founder plus up to two others. */
export class TreatyCreateExecution implements Execution {
  private active = true;

  constructor(
    private founder: Player,
    private memberIDs: string[],
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    // Tribes do not participate in superfork diplomacy - see
    // canUseSuperforkSystems.
    if (!canUseSuperforkSystems(this.founder.type())) return;

    const invited = this.memberIDs
      .filter((id) => mg.hasPlayer(id))
      .map((id) => mg.player(id))
      .filter((p) => p.id() !== this.founder.id() && p.isAlive());
    if (invited.length === 0) return;

    // Founder plus two. The schema caps the wire payload; this enforces the
    // rule even if a client sends more.
    const seats = TREATY_FOUNDING_SIZE - 1;
    const id = `treaty_${this.founder.id()}_${ticks}`;
    const treaty = new Treaty(id, this.founder);
    for (const p of invited.slice(0, seats)) treaty.add(p);
    treaties.set(id, treaty);

    for (const m of treaty.getMembers()) {
      mg.displayMessage(
        "events_display.treaty_formed",
        MessageType.ALLIANCE_ACCEPTED,
        m.id(),
        undefined,
        { count: treaty.getMembers().length },
      );
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

/**
 * Outstanding invitations, keyed `treatyID|recipientID`.
 *
 * Joining a bloc is consensual: an invite records an offer and the recipient
 * accepts it. Founding members are exempt - accepting a treaty creation is
 * itself the consent, and requiring a second round-trip for the two founders
 * would make creating one a three-step handshake.
 */
const pendingInvites = new Map<string, { treatyID: string }>();

function inviteKey(treatyID: string, recipientID: string): string {
  return `${treatyID}|${recipientID}`;
}

export function pendingInviteFor(treatyID: string, recipient: Player): boolean {
  return pendingInvites.has(inviteKey(treatyID, recipient.id()));
}

/** Invite a nation to an existing treaty. Takes effect only once accepted. */
export class TreatyInviteExecution implements Execution {
  private active = true;

  constructor(
    private inviter: Player,
    private treatyID: string,
    private recipientID: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    const treaty = treaties.get(this.treatyID);
    // Only members may invite - otherwise anyone could bolt themselves onto
    // any bloc on the map.
    if (treaty === undefined || !treaty.has(this.inviter)) return;
    if (!mg.hasPlayer(this.recipientID)) return;
    if (treaty.isFull()) return;
    const recipient = mg.player(this.recipientID);
    if (treaty.has(recipient)) return;
    pendingInvites.set(inviteKey(this.treatyID, this.recipientID), {
      treatyID: this.treatyID,
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

/** Accept or decline an invitation. */
export class TreatyResponseExecution implements Execution {
  private active = true;

  constructor(
    private recipient: Player,
    private treatyID: string,
    private accept: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    const k = inviteKey(this.treatyID, this.recipient.id());
    if (!pendingInvites.has(k)) return;
    pendingInvites.delete(k);
    if (!this.accept) return;
    // Re-checked rather than trusted: the treaty may have filled up or been
    // dissolved between the invitation and the answer.
    treaties.get(this.treatyID)?.add(this.recipient);
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/** Leave a treaty. Not treachery — no traitor flag. */
export class TreatyLeaveExecution implements Execution {
  private active = true;

  constructor(
    private leaver: Player,
    private treatyID: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    const treaty = treaties.get(this.treatyID);
    if (treaty === undefined) return;
    treaty.remove(this.leaver);
    // A treaty of one is just a nation; drop it rather than leaving husks
    // around for the UI to render.
    if (treaty.getMembers().length <= 1) treaties.delete(this.treatyID);
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
