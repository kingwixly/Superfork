import {
  canUseSuperforkSystems,
  EMBASSY_SLOW_DURATION,
  EMBASSY_TROOP_PENALTY,
} from "../configuration/SuperforkUnits";
import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
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
    if (!mg.hasPlayer(this.hostID)) return;

    const host = mg.player(this.hostID);
    if (host.id() === this.guest.id()) return;
    if (!canUseSuperforkSystems(host.type())) return;
    // The tile must actually be the host's - an embassy sits in their land by
    // definition, and the wire payload is not trusted.
    if (mg.owner(this.tile) !== host) return;

    pending.set(key(this.guest, host), {
      guest: this.guest,
      host,
      tile: this.tile,
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
    if (!this.accept) return;

    // Re-checked: the tile may have changed hands between request and answer.
    if (mg.owner(req.tile) !== this.host) return;

    // Owned by the GUEST while standing on the HOST's land - that foreign
    // ownership inside another nation's borders is the whole mechanic.
    guest.buildUnit(UnitType.Embassy, req.tile, { host: this.host });
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
