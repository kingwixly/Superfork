import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  PlayerType,
  Relation,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { Execution, Game, Player } from "../game/Game";
import { Province } from "../game/Provinces";
import type { ExecRecord } from "../snapshot/SnapshotContext";
import { unsnapshottable } from "../snapshot/Unsnapshottable";
import { AttackExecution } from "./AttackExecution";
import { foundNation } from "./FoundNation";
import { tryIntegrateTribe } from "./ProvinceExecution";

/** Chance per province, per new attack on its nation, of declaring independence. */
export const BREAKAWAY_CHANCE = 0.01;
let breakawayChance = BREAKAWAY_CHANCE;
/** Tests only: make breakaways certain (1) or impossible (0). */
export function setBreakawayChanceForTests(chance: number): void {
  breakawayChance = chance;
}
/** The same attacker re-attacking within this many ticks is not a new attack. */
export const NEW_ATTACK_WINDOW = 10 * 10;
/** Capital collapse needs at least this many provinces... */
export const COLLAPSE_MIN_PROVINCES = 5;
/** ...and hands this many of the smallest to the captor. */
export const COLLAPSE_PROVINCES_LOST = 3;
/** How often AI nations think about provinces, in ticks. */
export const AI_PROVINCE_PERIOD = 10 * 10;

/** Attacks noted this tick, picked up by the rules on the next. */
const attackedThisTick = new WeakMap<Game, Player[]>();
/** Last tick each attacker→target pair counted as a new attack. */
const lastCounted = new WeakMap<Game, Map<string, number>>();

/** Called by AttackExecution for every attack that actually starts. */
export function noteProvinceAttacked(mg: Game, target: Player): void {
  if (!mg.config().provincesEnabled()) return;
  if (mg.provinces().countOwnedBy(target) === 0) return;
  let list = attackedThisTick.get(mg);
  if (list === undefined) attackedThisTick.set(mg, (list = []));
  list.push(target);
}

/**
 * Province rules that run every tick when provinces are on:
 *
 *  - **Breakaways:** each time a nation comes under a new attack, each of its
 *    provinces (not the administrative one) has a 1% chance to declare
 *    independence as a neutral nation.
 *  - **Capital collapse:** a nation with 5+ provinces that loses its capital
 *    hands its 3 smallest provinces to whoever took it.
 *  - **Province news:** provinces changing hands are announced to both sides.
 *  - **AI:** nations split their land into provinces, finish off enemy
 *    provinces they already mostly hold, and court neighbouring tribes.
 */
export class ProvinceRulesExecution implements Execution {
  snapshot(): ExecRecord {
    return unsnapshottable("ProvinceRulesExecution");
  }

  private mg: Game;
  private random = new PseudoRandom(0x9e3779b);
  /** Where each nation with enough provinces kept its capital last tick. */
  private capitals = new Map<number, TileRef>();

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    const mg = this.mg;
    if (!mg.config().provincesEnabled()) return;
    this.breakaways(ticks);
    this.capitalCollapse();
    this.announceCaptures();
    if (ticks % AI_PROVINCE_PERIOD === 0) this.nationsThink(ticks);
  }

  // -------------------------------------------------------------- breakaway

  private breakaways(ticks: number): void {
    const attacked = attackedThisTick.get(this.mg);
    if (attacked === undefined || attacked.length === 0) return;
    attackedThisTick.set(this.mg, []);
    let counted = lastCounted.get(this.mg);
    if (counted === undefined) lastCounted.set(this.mg, (counted = new Map()));
    const seen = new Set<Player>();
    for (const target of attacked) {
      if (seen.has(target) || !target.isAlive()) continue;
      seen.add(target);
      const key = String(target.smallID());
      const last = counted.get(key);
      if (last !== undefined && ticks - last < NEW_ATTACK_WINDOW) continue;
      counted.set(key, ticks);
      for (const p of this.mg.provinces().ownedBy(target)) {
        if (p.administrative) continue;
        if (this.random.next() >= breakawayChance) continue;
        this.breakAway(p);
      }
    }
  }

  private breakAway(p: Province): void {
    const mg = this.mg;
    const owner = p.owner;
    const tiles = p.tiles.filter((t) => mg.owner(t) === owner);
    const name = p.name;
    mg.provinces().disband(p);
    const free = foundNation(mg, name, tiles, { kind: "nation" });
    if (free === null) return;
    mg.displayMessage(
      "events_display.province_breakaway",
      MessageType.ALLIANCE_BROKEN,
      null,
      undefined,
      { province: name, player: owner.displayName() },
    );
  }

  // ------------------------------------------------------- capital collapse

  private capitalCollapse(): void {
    const mg = this.mg;
    for (const player of mg.players()) {
      const id = player.smallID();
      const count = mg.provinces().countOwnedBy(player);
      if (count < COLLAPSE_MIN_PROVINCES) {
        this.capitals.delete(id);
        continue;
      }
      const capital = player.units(UnitType.Capital)[0];
      if (capital !== undefined) {
        this.capitals.set(id, capital.tile());
        continue;
      }
      const lost = this.capitals.get(id);
      if (lost === undefined) continue;
      this.capitals.delete(id);
      const holder = mg.owner(lost);
      if (!holder.isPlayer() || holder === player) continue;
      this.collapse(player, holder as Player);
    }
  }

  private collapse(loser: Player, captor: Player): void {
    const mg = this.mg;
    const smallest = mg
      .provinces()
      .ownedBy(loser)
      .sort((a, b) => a.size() - b.size() || a.id - b.id)
      .slice(0, COLLAPSE_PROVINCES_LOST);
    const names: string[] = [];
    for (const p of smallest) {
      names.push(p.name);
      for (const t of p.tiles) {
        if (mg.owner(t) === loser) captor.conquer(t);
      }
    }
    mg.displayMessage(
      "events_display.capital_collapse",
      MessageType.ALLIANCE_BROKEN,
      null,
      undefined,
      {
        player: loser.displayName(),
        captor: captor.displayName(),
        provinces: names.join(", "),
      },
    );
  }

  private announceCaptures(): void {
    for (const p of this.mg.provinces().drainCaptured()) {
      this.mg.displayMessage(
        "events_display.province_taken",
        MessageType.ALLIANCE_ACCEPTED,
        p.owner.id(),
        undefined,
        { province: p.name },
      );
    }
  }

  // -------------------------------------------------------------------- AI

  private nationsThink(ticks: number): void {
    for (const nation of this.mg.players()) {
      if (nation.type() !== PlayerType.Nation || !nation.isAlive()) continue;
      this.maybePartition(nation);
      this.maybeTakeProvince(nation);
      if (this.random.chance(6)) this.maybeCourtTribe(nation);
    }
  }

  /** Big nations split their land into a few provinces for the bonuses. */
  private maybePartition(nation: Player): void {
    const provinces = this.mg.provinces();
    const min = provinces.minSize(nation);
    const owned = provinces.countOwnedBy(nation);
    const target = Math.min(6, Math.floor(nation.numTilesOwned() / (2 * min)));
    if (owned >= target) return;
    const federal: TileRef[] = [];
    for (const t of nation.tiles()) {
      if (provinces.idAt(t) === 0) federal.push(t);
    }
    if (federal.length < 3 * min) return;
    const capital = nation.units(UnitType.Capital)[0]?.tile();
    // Seeds spread out by farthest-point sampling over a sample of the land.
    const sample: TileRef[] = [];
    const step = Math.max(1, Math.floor(federal.length / 400));
    for (let i = 0; i < federal.length; i += step) sample.push(federal[i]);
    const seeds: TileRef[] = [capital ?? sample[0]];
    const want = Math.min(target - owned + 1, 6);
    while (seeds.length < want + 1) {
      let best = sample[0];
      let bestD = -1;
      for (const t of sample) {
        let d = Infinity;
        for (const s of seeds) d = Math.min(d, this.mg.manhattanDist(t, s));
        if (d > bestD) {
          bestD = d;
          best = t;
        }
      }
      if (bestD <= 0) break;
      seeds.push(best);
    }
    provinces.partition(nation, seeds, capital);
  }

  /** Finish off an enemy province we already hold most of. */
  private maybeTakeProvince(nation: Player): void {
    if (nation.troops() < this.mg.config().maxTroops(nation) * 0.3) return;
    let best: Province | null = null;
    let bestShare = 0.4;
    for (const p of this.mg.provinces().all()) {
      if (p.owner === nation || nation.isFriendly(p.owner)) continue;
      const share = p.heldBy(nation) / Math.max(1, p.size());
      if (share > bestShare) {
        bestShare = share;
        best = p;
      }
    }
    if (best === null || !nation.canAttackPlayer(best.owner)) return;
    if (nation.relation(best.owner) > Relation.Neutral) return;
    const attack = new AttackExecution(
      Math.floor(nation.troops() * 0.2),
      nation,
      best.owner.id(),
      null,
    );
    attack.restrictToProvince(best.id);
    this.mg.addExecution(attack);
  }

  /** Ask a neighbouring tribe to join. */
  private maybeCourtTribe(nation: Player): void {
    const tribe = this.mg
      .players()
      .find(
        (n) =>
          n.type() === PlayerType.Bot &&
          n.isAlive() &&
          nation.sharesBorderWith(n),
      );
    if (tribe === undefined) return;
    tryIntegrateTribe(this.mg, nation, tribe);
  }

  isActive(): boolean {
    return true;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
