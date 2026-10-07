import {
  canUseSuperforkSystems,
  EMBASSY_SLOW_DURATION,
  EMBASSY_TROOP_PENALTY,
} from "../configuration/SuperforkUnits";
import {
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";

interface PendingEmbassy {
  guest: Player;
  host: Player;
  tile: TileRef;
}

/** Outstanding embassy requests, keyed `guest|host`. Same caveat as ceasefires. */
const pending = new Map<string, PendingEmbassy>();

function key(guest: Player, host: Player): string {
  return `${guest.id()}|${host.id()}`;
}

export function pendingEmbassyBetween(
  guest: Player,
  host: Player,
): PendingEmbassy | undefined {
  return pending.get(key(guest, host));
}

export function hasPendingEmbassies(): boolean {
  return pending.size > 0;
}
export function clearPendingEmbassies(): void {
  pending.clear();
}

/**
 * Request permission to open an embassy.
 *
 * Embassies are the one structure that lives inside someone else's borders, so
 * placement is a two-sided handshake rather than a build: the guest nominates
 * a tile in the host's territory, the host accepts. Per Dani's decision both
 * nations must agree.
 */
export class EmbassyRequestExecution implements Execution {
  private active = true;

  constructor(
    private guest: Player,
    private hostID: string,
    private tile: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!canUseSuperforkSystems(this.guest.type())) return;
    // The lobby can switch embassies off; buildUnit throws for disabled types.
    if (mg.config().isUnitDisabled(UnitType.Embassy)) return;
    if (!mg.hasPlayer(this.hostID)) return;

    const host = mg.player(this.hostID);
    if (host.id() === this.guest.id()) return;
    if (!canUseSuperforkSystems(host.type())) return;
    // The tile must actually be the host's - an embassy sits in their land by
    // definition, and the wire payload is not trusted.
    if (mg.owner(this.tile) !== host) return;

    // The guest pays on opening, so refuse up front rather than letting a
    // host approve something that then silently fails.
    const cost = mg.unitInfo(UnitType.Embassy).cost(mg, this.guest);
    if (this.guest.gold() < cost) return;
    pending.set(key(this.guest, host), {
      guest: this.guest,
      host,
      tile: this.tile,
    });
    // Nothing told the host a request existed, so it could never be
    // answered. focusPlayerID carries the guest for the Accept button.
    mg.displayMessage(
      "events_display.embassy_request_sent",
      MessageType.ALLIANCE_REQUEST,
      this.guest.id(),
      undefined,
      { player: host.displayName() },
    );
    mg.displayMessage(
      "events_display.embassy_requested",
      MessageType.ALLIANCE_REQUEST,
      host.id(),
      undefined,
      { player: this.guest.displayName() },
      undefined,
      this.guest.id(),
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

/** Accept or decline an embassy request. */
export class EmbassyResponseExecution implements Execution {
  private active = true;

  constructor(
    private host: Player,
    private guestID: string,
    private accept: boolean,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.guestID)) return;
    const guest = mg.player(this.guestID);

    const k = key(guest, this.host);
    const req = pending.get(k);
    if (req === undefined) return;
    pending.delete(k);
    if (!this.accept) {
      mg.displayMessage(
        "events_display.embassy_declined",
        MessageType.ALLIANCE_REJECTED,
        guest.id(),
        undefined,
        { player: this.host.displayName() },
      );
      return;
    }

    // Re-checked: the tile may have changed hands between request and answer.
    if (mg.owner(req.tile) !== this.host) return;
    // Re-checked too: removeGold clamps, so a guest who spent the money in
    // the meantime would otherwise get the embassy free.
    const cost = mg.unitInfo(UnitType.Embassy).cost(mg, guest);
    if (guest.gold() < cost) return;

    // Owned by the GUEST while standing on the HOST's land - that foreign
    // ownership inside another nation's borders is the whole mechanic.
    guest.buildUnit(UnitType.Embassy, req.tile, { host: this.host });
    for (const [who, other] of [
      [guest, this.host],
      [this.host, guest],
    ] as const) {
      mg.displayMessage(
        "events_display.embassy_opened",
        MessageType.ALLIANCE_ACCEPTED,
        who.id(),
        undefined,
        { player: other.displayName() },
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
 * Apply the seizure debuff when an embassy changes hands in war.
 *
 * Taking an embassy costs its former owner a tenth of their army and slows
 * their advance for a few seconds. Recapturing flips it: whoever just lost the
 * building takes the hit, so a contested embassy swings the penalty back and
 * forth rather than being a one-time prize.
 *
 * Called from UnitImpl.setOwner, alongside the bank payout and capital
 * penalty, because that is the single choke point every capture goes through.
 */
export function applyEmbassySeizure(
  mg: Game,
  embassy: Unit,
  loser: Player,
  captor: Player,
): void {
  if (embassy.type() !== UnitType.Embassy) return;
  if (loser.id() === captor.id()) return;

  const lost = Math.floor(loser.troops() * EMBASSY_TROOP_PENALTY);
  if (lost > 0) loser.removeTroops(lost);
  loser.applyTroopSlow(mg.ticks() + EMBASSY_SLOW_DURATION);
}
