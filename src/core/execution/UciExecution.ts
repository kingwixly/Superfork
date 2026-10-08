import {
  Execution,
  Game,
  MessageType,
  Player,
  PlayerType,
  Unit,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  hasUciInfiniteGold,
  hasUciInfiniteTroops,
  setAttackLocked,
  setUciAiAnswers,
  setUciInfiniteGold,
  setUciInfiniteTroops,
} from "../game/Uci";
import { UciIntent } from "../Schemas";
import { AttackExecution } from "./AttackExecution";

/** Gold an infinite-gold player is topped back up to every tick. */
export const UCI_GOLD_FLOOR = 1_000_000_000_000n;
/** Share of its army each AI throws at the target of "make AI attack". */
export const UCI_AI_ATTACK_SHARE = 0.5;

/**
 * Carries out one UCI developer-tool action.
 *
 * The server only relays these from a client that proved the UCI password,
 * so nothing here re-checks who sent it. Everything is announced to every
 * player (Dani's rule: admin powers work anywhere, but never silently).
 */
export class UciExecution implements Execution {
  private mg: Game;
  private done = false;

  constructor(
    private admin: Player,
    private intent: Omit<UciIntent, "type">,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  /**
   * The work happens on the first tick, not in init: executions queued from
   * inside another execution's init are dropped by GameImpl, and several
   * actions here queue some (the cheat loop, the AI attacks).
   */
  tick(ticks: number): void {
    if (this.done) return;
    this.done = true;
    this.run();
  }

  private run(): void {
    const mg = this.mg;
    const i = this.intent;
    const target = this.playerOr(i.targetID, null);
    const name = (p: Player) => p.displayName();

    switch (i.action) {
      case "gold": {
        const who = target ?? this.admin;
        const on = i.enabled ?? true;
        setUciInfiniteGold(who, on);
        if (on) UciCheatExecution.ensure(mg);
        this.notice(on ? "uci.notice_gold_on" : "uci.notice_gold_off", {
          target: name(who),
        });
        return;
      }
      case "troops": {
        const who = target ?? this.admin;
        const on = i.enabled ?? true;
        setUciInfiniteTroops(who, on);
        if (on) UciCheatExecution.ensure(mg);
        this.notice(on ? "uci.notice_troops_on" : "uci.notice_troops_off", {
          target: name(who),
        });
        return;
      }
      case "lock_attack": {
        if (target === null) return;
        const on = i.enabled ?? true;
        setAttackLocked(target, on);
        this.notice(on ? "uci.notice_lock_on" : "uci.notice_lock_off", {
          target: name(target),
        });
        return;
      }
      case "cede_country": {
        const recipient = this.playerOr(i.recipientID, this.admin);
        if (target === null || recipient === null || target === recipient) {
          return;
        }
        this.giveCountry(target, recipient);
        this.notice("uci.notice_cede_country", {
          target: name(target),
          recipient: name(recipient),
        });
        return;
      }
      case "cede_area": {
        const recipient = this.playerOr(i.recipientID, this.admin);
        if (recipient === null) return;
        let moved = 0;
        for (const tile of i.tiles ?? []) {
          if (!mg.isValidRef(tile) || !mg.isLand(tile)) continue;
          if (mg.owner(tile) === recipient) continue;
          recipient.conquer(tile);
          moved++;
        }
        if (moved > 0) {
          this.notice("uci.notice_cede_area", {
            count: moved,
            recipient: name(recipient),
          });
        }
        return;
      }
      case "switch": {
        if (target === null || target === this.admin) return;
        this.swap(this.admin, target);
        this.notice("uci.notice_switch", { target: name(target) });
        return;
      }
      case "disappear": {
        if (target === null) return;
        this.wipe(target);
        this.notice("uci.notice_disappear", { target: name(target) });
        return;
      }
      case "ai_attack": {
        const victim = target ?? this.admin;
        this.unleashAi(victim);
        this.notice("uci.notice_ai_attack", { target: name(victim) });
        return;
      }
      case "ai_answers": {
        const mode = i.aiAnswer ?? "normal";
        setUciAiAnswers(mg, mode);
        this.notice(
          mode === "yes"
            ? "uci.notice_ai_yes"
            : mode === "no"
              ? "uci.notice_ai_no"
              : "uci.notice_ai_normal",
          {},
        );
        return;
      }
      case "announce": {
        const text = (i.text ?? "").trim();
        if (text.length === 0) return;
        mg.displayMessage(
          "uci.announcement",
          MessageType.CHAT,
          null,
          undefined,
          { text },
        );
        return;
      }
      case "pause": {
        // The server stops issuing turns itself; this keeps every client's
        // paused banner in step.
        mg.setPaused(i.enabled ?? true);
        this.notice(
          (i.enabled ?? true) ? "uci.notice_paused" : "uci.notice_unpaused",
          {},
        );
        return;
      }
      case "end_game": {
        if (mg.getWinner() !== null) return;
        this.notice("uci.notice_end_game", {});
        mg.setWinner(null, mg.stats().stats());
        return;
      }
      case "transfer_host": {
        if (i.targetClientID === undefined) return;
        const next = mg.playerByClientID(i.targetClientID);
        if (next === null) return;
        for (const p of mg.players()) {
          if (p.isLobbyCreator() || p === next) p.setLobbyCreator(p === next);
        }
        this.notice("uci.notice_transfer_host", { target: name(next) });
        return;
      }
    }
  }

  private playerOr(id: string | undefined, fallback: Player | null) {
    if (id === undefined) return fallback;
    return this.mg.hasPlayer(id) ? this.mg.player(id) : null;
  }

  private notice(key: string, params: Record<string, string | number>) {
    this.mg.displayMessage(key, MessageType.CHAT, null, undefined, params);
  }

  /** All of `from`'s land and units become `to`'s; `from` is gone. */
  private giveCountry(from: Player, to: Player): void {
    const tiles: TileRef[] = [...from.tiles()];
    const units: Unit[] = from.units();
    for (const t of tiles) to.conquer(t);
    for (const u of units) if (u.isActive()) u.setOwner(to);
  }

  /** Swap everything two countries own: land, units, gold and troops. */
  private swap(a: Player, b: Player): void {
    const aTiles: TileRef[] = [...a.tiles()];
    const bTiles: TileRef[] = [...b.tiles()];
    const aUnits = a.units();
    const bUnits = b.units();
    const aGold = a.gold();
    const bGold = b.gold();
    const aTroops = a.troops();
    const bTroops = b.troops();
    for (const t of bTiles) a.conquer(t);
    for (const t of aTiles) b.conquer(t);
    for (const u of bUnits) if (u.isActive()) u.setOwner(a);
    for (const u of aUnits) if (u.isActive()) u.setOwner(b);
    a.removeGold(aGold);
    b.removeGold(bGold);
    a.addGold(bGold);
    b.addGold(aGold);
    a.setTroops(bTroops);
    b.setTroops(aTroops);
  }

  /** Remove a country: its land goes back to the wilderness. */
  private wipe(p: Player): void {
    for (const u of p.units()) if (u.isActive()) u.delete(false);
    for (const t of [...p.tiles()]) p.relinquish(t);
    p.setTroops(0);
  }

  /** Every AI turns on `victim`: alliances broken, hostility maxed, attacks. */
  private unleashAi(victim: Player): void {
    for (const ai of this.mg.players()) {
      if (ai === victim || !ai.isAlive()) continue;
      const type = ai.type();
      if (type !== PlayerType.Nation && type !== PlayerType.Bot) continue;
      const alliance = ai.allianceWith(victim);
      if (alliance !== null) ai.breakAlliance(alliance);
      ai.updateRelation(victim, -100);
      if (ai.sharesBorderWith(victim)) {
        const troops = Math.floor(ai.troops() * UCI_AI_ATTACK_SHARE);
        if (troops > 0) {
          this.mg.addExecution(
            new AttackExecution(troops, ai, victim.id(), null),
          );
        }
      }
    }
  }

  isActive(): boolean {
    return !this.done;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}

/**
 * Keeps infinite-gold and infinite-troops players topped up. One per game,
 * started by the first cheat switched on; idle and cheap when nobody has one.
 */
export class UciCheatExecution implements Execution {
  private static running = new WeakSet<Game>();
  private mg: Game;

  static ensure(mg: Game): void {
    if (UciCheatExecution.running.has(mg)) return;
    UciCheatExecution.running.add(mg);
    mg.addExecution(new UciCheatExecution());
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    for (const p of this.mg.players()) {
      if (!p.isAlive()) continue;
      if (hasUciInfiniteGold(p) && p.gold() < UCI_GOLD_FLOOR) {
        p.addGold(UCI_GOLD_FLOOR - p.gold());
      }
      if (hasUciInfiniteTroops(p)) {
        const max = this.mg.config().maxTroops(p);
        if (p.troops() < max) p.setTroops(max);
      }
    }
  }

  isActive(): boolean {
    return true;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
