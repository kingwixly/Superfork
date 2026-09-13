import { Execution, Game, Player } from "../game/Game";
import { AttackExecution } from "./AttackExecution";

/** Share of the helper's army committed when they answer a call for help. */
export const ASSISTANCE_COMMITMENT = 0.25;

interface PendingRequest {
  requestor: Player;
  helper: Player;
  against: Player;
  mode: "attack" | "troops";
}

/**
 * Outstanding calls for help, keyed `requestor|helper`.
 *
 * Same module-level caveat as ceasefires and treaties: safe only because a
 * worker runs one game.
 */
const pendingRequests = new Map<string, PendingRequest>();

function key(requestor: Player, helper: Player): string {
  return `${requestor.id()}|${helper.id()}`;
}

export function pendingAssistanceFrom(
  requestor: Player,
  helper: Player,
): PendingRequest | undefined {
  return pendingRequests.get(key(requestor, helper));
}

export function clearPendingAssistance(): void {
  pendingRequests.clear();
}

/**
 * Ask an ally to join a war directly.
 *
 * Vanilla leaves allied intervention entirely to the ally's own judgement —
 * you can only hope they notice. This makes it an explicit request with two
 * concrete forms of help, so "I am losing, help me" is something you can
 * actually say rather than imply.
 *
 * Only allies can be asked. Asking a neutral party would be an alliance
 * request wearing a different hat, and the existing system already covers
 * that.
 */
export class RequestAssistanceExecution implements Execution {
  private active = true;

  constructor(
    private requestor: Player,
    private helperID: string,
    private againstID: string,
    private mode: "attack" | "troops",
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.helperID) || !mg.hasPlayer(this.againstID)) return;

    const helper = mg.player(this.helperID);
    const against = mg.player(this.againstID);
    if (helper.id() === this.requestor.id()) return;
    if (against.id() === helper.id()) return;
    // You may only call on an ally.
    if (!this.requestor.isFriendly(helper)) return;

    pendingRequests.set(key(this.requestor, helper), {
      requestor: this.requestor,
      helper,
      against,
      mode: this.mode,
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

/**
 * Answer a call for help.
 *
 * Accepting commits real resources immediately rather than merely promising
 * them — the point of asking is that something happens now.
 *
 *  - **attack**: the helper opens a front against the aggressor, committing a
 *    share of their army. Refused if they do not share a border, since there
 *    is nowhere to attack from; the caller should ask for troops instead.
 *  - **troops**: the helper donates directly, which works at any distance and
 *    is the only useful option for a landlocked or far-off ally.
 */
export class AssistanceResponseExecution implements Execution {
  private active = true;

  constructor(
    private helper: Player,
    private requestorID: string,
    private accept: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.requestorID)) return;
    const requestor = mg.player(this.requestorID);

    const k = key(requestor, this.helper);
    const req = pendingRequests.get(k);
    if (req === undefined) return;
    pendingRequests.delete(k);
    if (!this.accept) return;

    const committed = Math.floor(this.helper.troops() * ASSISTANCE_COMMITMENT);
    if (committed <= 0) return;

    if (req.mode === "troops") {
      this.helper.donateTroops(requestor, committed);
      return;
    }

    // Attacking an ally's enemy is not treachery toward that enemy unless one
    // is already allied to them - and if so, refuse rather than silently
    // making the helper a traitor.
    if (this.helper.isFriendly(req.against)) return;
    if (!this.helper.sharesBorderWith(req.against)) return;

    mg.addExecution(
      new AttackExecution(
        committed,
        this.helper,
        req.against.id(),
        null,
        false,
      ),
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
