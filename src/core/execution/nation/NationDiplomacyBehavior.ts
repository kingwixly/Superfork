import { PseudoRandom } from "../../PseudoRandom";
import { Game, Player, PlayerType, Relation } from "../../game/Game";
import {
  AssistanceResponseExecution,
  pendingAssistanceFrom,
} from "../AssistanceExecution";
import {
  CEASEFIRE_DURATION_TICKS,
  CeasefireProposeExecution,
  CeasefireResponseExecution,
  pendingCeasefireBetween,
} from "../CeasefireExecution";
import {
  EmbassyResponseExecution,
  pendingEmbassyBetween,
} from "../EmbassyExecution";
import { SanctionExecution } from "../SanctionExecution";

/** Troop ratio below which a nation considers suing for peace. */
const LOSING_RATIO = 0.4;

/**
 * Nation AI diplomacy.
 *
 * Kept deliberately narrow. Diplomacy AI is the easiest thing in this fork to
 * make look stupid: a bot that sanctions at random, or sues for peace while
 * winning, reads as broken rather than clever. So this does three things, each
 * tied to an observable condition a human would recognise:
 *
 *  - **Sanction nations it already hates.** A sanction is the escalation of an
 *    embargo, so it follows the same hostility signal vanilla already uses,
 *    just at a higher threshold. It never sanctions an ally.
 *  - **Accept a ceasefire when losing.** If a nation is badly outnumbered by
 *    the proposer, taking the truce is obviously right.
 *  - **Sue for peace when badly outnumbered.** The mirror of the above, so a
 *    losing bot asks rather than only ever answering.
 *
 * Treaties, liberation, cede-land and puppets are left to human players. Each
 * needs judgement about a whole board state, and a bot making those moves
 * badly would be worse than a bot not making them at all.
 */
export class NationDiplomacyBehavior {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
  ) {}

  tick(): void {
    // All three throttled. answerCeasefires walks every player, so at 50
    // nations an unthrottled call was ~2500 lookups per tick across the
    // fleet before any other behaviour ran. A truce offer waiting a few
    // ticks for an answer is invisible in play.
    // Embassy and aid answers ride the ceasefire throttle rather than drawing
    // their own random number: an extra draw shifts every later decision this
    // nation makes, which reshuffled whole benchmark games.
    if (this.random.chance(20)) {
      this.answerCeasefires();
      this.answerEmbassiesAndAid();
    }
    if (this.random.chance(200)) this.maybeSanction();
    if (this.random.chance(300)) this.maybeSueForPeace();
  }

  /** Answer any outstanding ceasefire offers. */
  private answerCeasefires(): void {
    for (const other of this.game.players()) {
      if (other.id() === this.player.id()) continue;
      const offer = pendingCeasefireBetween(other, this.player);
      if (offer === undefined) continue;

      // Accept if we are losing to them, decline if we are winning. A bot
      // that accepts while ahead throws away a won war.
      const accept = this.player.troops() < other.troops() * LOSING_RATIO;
      this.game.addExecution(
        new CeasefireResponseExecution(this.player, other.id(), accept),
      );
    }
  }

  /**
   * Answer embassy requests and calls for help. Without this, asking a nation
   * for either waited forever: only humans could ever answer.
   */
  private answerEmbassiesAndAid(): void {
    for (const other of this.game.players()) {
      if (other.id() === this.player.id()) continue;

      // Host an embassy for anyone we are not hostile to; an embassy is a
      // foothold, so a nation that distrusts you says no.
      if (pendingEmbassyBetween(other, this.player) !== undefined) {
        const accept =
          this.player.isFriendly(other) ||
          this.player.relation(other) >= Relation.Neutral;
        this.game.addExecution(
          new EmbassyResponseExecution(this.player, other.id(), accept),
        );
      }

      // Help an ally unless we are fighting for our own life.
      if (pendingAssistanceFrom(other, this.player) !== undefined) {
        const accept =
          this.player.isFriendly(other) &&
          this.player.troops() > other.troops() * LOSING_RATIO;
        this.game.addExecution(
          new AssistanceResponseExecution(this.player, other.id(), accept),
        );
      }
    }
  }

  /** Escalate an embargo into a sanction against a hated neighbour. */
  private maybeSanction(): void {
    const candidates = this.game
      .players()
      .filter(
        (p) =>
          p.id() !== this.player.id() &&
          p.isAlive() &&
          p.type() !== PlayerType.Bot &&
          !this.player.isFriendly(p) &&
          this.player.relation(p) === Relation.Hostile &&
          !this.player.hasSanctionAgainst(p),
      );
    if (candidates.length === 0) return;

    const target = this.random.randElement(candidates);
    this.game.addExecution(
      new SanctionExecution(this.player, target.id(), "start"),
    );
  }

  /** Propose a truce to whoever is beating us worst. */
  private maybeSueForPeace(): void {
    const threats = this.game
      .players()
      .filter(
        (p) =>
          p.id() !== this.player.id() &&
          p.isAlive() &&
          !this.player.isFriendly(p) &&
          !this.player.hasCeasefireWith(p) &&
          this.player.troops() < p.troops() * LOSING_RATIO &&
          p.sharesBorderWith(this.player),
      );
    if (threats.length === 0) return;

    // The biggest threat, not a random one - asking the weakest enemy for
    // peace while the strongest rolls over you is exactly the kind of move
    // that makes a bot look thoughtless.
    const worst = threats.reduce((a, b) => (b.troops() > a.troops() ? b : a));
    this.game.addExecution(
      new CeasefireProposeExecution(this.player, worst.id(), undefined),
    );
  }
}

export { CEASEFIRE_DURATION_TICKS };
