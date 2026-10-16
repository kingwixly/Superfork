import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  MessageType,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { ProvinceIntent } from "@openfront/engine-api/Schemas";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { simpleHash } from "@openfront/engine-lib/Util";
import { Execution, Game, Player } from "../game/Game";
import { MAX_PROVINCE_NAME, Province, splitStrokes } from "../game/Provinces";
import type { ExecRecord } from "../snapshot/SnapshotContext";
import { unsnapshottable } from "../snapshot/Unsnapshottable";
import { AttackExecution } from "./AttackExecution";
import { foundNation } from "./FoundNation";

/** A tribe joins one integration request in this many. */
export const INTEGRATION_ODDS = 6;
/** Ticks before the same tribe can be asked again by the same nation. */
export const INTEGRATION_COOLDOWN = 30 * 10;
/** Relation boost between a liberator and the province's founder. */
export const LIBERATION_GOODWILL = 50;

const lastIntegrationAsk = new WeakMap<Game, Map<string, number>>();

/** Names shown to every player go through a light filter. */
function validName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_PROVINCE_NAME) return false;
  // Letters, numbers, spaces and simple punctuation only.
  return /^[\p{L}\p{N} '.\-()&]+$/u.test(name);
}

/**
 * Every province action a player can take: draw, rename, mark as the
 * administrative province, disband, merge, trim to owned land, liberate,
 * integrate a tribe, and attack one province.
 *
 * Refused outright unless the lobby turned provinces on. The work happens on
 * the first tick rather than in init, because liberation, integration and
 * province attacks queue executions (and ones queued from an init are
 * dropped).
 */
export class ProvinceExecution implements Execution {
  snapshot(): ExecRecord {
    return unsnapshottable("ProvinceExecution");
  }

  private active = true;
  private mg: Game;

  constructor(
    private player: Player,
    private intent: Omit<ProvinceIntent, "type">,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.active) return;
    this.active = false;
    const mg = this.mg;
    if (!mg.config().provincesEnabled()) return;
    if (!this.player.isAlive()) return;
    const provinces = mg.provinces();
    const i = this.intent;

    if (i.action === "draw") {
      const strokes = splitStrokes(i.points ?? [], i.breaks ?? []);
      const capital = this.player.units(UnitType.Capital)[0]?.tile();
      const made = provinces.draw(this.player, strokes, capital);
      // Say what happened: a drawing that creates nothing is otherwise
      // indistinguishable from a broken tool.
      if (made.length > 0) {
        this.tell("events_display.provinces_created", true, {
          count: made.length,
        });
      } else {
        this.tell("events_display.provinces_none", false, {
          min: provinces.minSize(this.player),
        });
      }
      return;
    }

    if (i.action === "integrate") {
      this.integrate(i.targetID);
      return;
    }

    const p =
      i.provinceId === undefined ? undefined : provinces.get(i.provinceId);
    if (p === undefined) return;

    if (i.action === "attack") {
      this.attackProvince(p, i.troops);
      return;
    }

    if (p.owner !== this.player) return;

    switch (i.action) {
      case "rename": {
        const name = (i.name ?? "").trim();
        if (!validName(name)) return;
        provinces.rename(p, name);
        return;
      }
      case "admin": {
        // The capital must sit in the administrative province.
        const capital = this.player.units(UnitType.Capital)[0];
        if (
          capital !== undefined &&
          provinces.provinceAt(capital.tile()) !== p
        ) {
          this.tell("events_display.admin_needs_capital", false, {
            province: p.name,
          });
          return;
        }
        provinces.setAdministrative(p);
        return;
      }
      case "disband":
        provinces.disband(p);
        return;
      case "trim":
        provinces.trim(p);
        return;
      case "merge": {
        const other =
          i.otherId === undefined ? undefined : provinces.get(i.otherId);
        if (other === undefined || other === p) return;
        if (other.owner !== this.player) return;
        if (!provinces.adjacent(p, other)) return;
        provinces.merge(p, other);
        return;
      }
      case "liberate":
        liberateProvince(mg, p, this.player);
        return;
    }
  }

  private tell(
    key: string,
    good: boolean,
    params: Record<string, string | number>,
  ) {
    this.mg.displayMessage(
      key,
      good ? MessageType.ALLIANCE_ACCEPTED : MessageType.ALLIANCE_REJECTED,
      this.player.id(),
      undefined,
      params,
    );
  }

  /** Ask a neighbouring tribe to join as a province. */
  private integrate(tribeID: string | undefined): void {
    const mg = this.mg;
    if (tribeID === undefined || !mg.hasPlayer(tribeID)) return;
    const tribe = mg.player(tribeID);
    if (tribe.type() !== PlayerType.Bot || !tribe.isAlive()) return;
    if (!this.player.sharesBorderWith(tribe)) return;
    let asks = lastIntegrationAsk.get(mg);
    if (asks === undefined) lastIntegrationAsk.set(mg, (asks = new Map()));
    const key = `${this.player.id()}|${tribe.id()}`;
    const last = asks.get(key);
    if (last !== undefined && mg.ticks() - last < INTEGRATION_COOLDOWN) {
      this.tell("events_display.integration_wait", false, {
        tribe: tribe.displayName(),
      });
      return;
    }
    asks.set(key, mg.ticks());
    tryIntegrateTribe(mg, this.player, tribe);
  }

  /** An attack that only takes tiles of one province. */
  private attackProvince(p: Province, troops: number | undefined): void {
    const target = p.owner;
    if (target === this.player) return;
    if (!this.player.canAttackPlayer(target)) return;
    if (!this.mg.provinces().borders(p, this.player)) return;
    const amount =
      troops === undefined
        ? this.mg.config().attackAmount(this.player, target)
        : Math.min(troops, this.player.troops());
    if (amount <= 0) return;
    const attack = new AttackExecution(amount, this.player, target.id(), null);
    attack.restrictToProvince(p.id);
    this.mg.addExecution(attack);
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/**
 * Release a province as its own nation. The holder gives up whatever of it
 * they hold. If the holder is not the nation that drew it (they took it in a
 * war), freeing it improves relations with that founder.
 *
 * Call from a tick: it founds a nation.
 */
export function liberateProvince(
  mg: Game,
  p: Province,
  liberator: Player,
): Player | null {
  const provinces = mg.provinces();
  const tiles: TileRef[] = p.tiles.filter((t) => mg.owner(t) === liberator);
  const founder = p.founder;
  const name = p.name;
  provinces.disband(p);
  const freed = foundNation(mg, name, tiles, { kind: "nation" });
  if (freed === null) return null;
  freed.updateRelation(liberator, 100);
  if (founder !== liberator && founder.isAlive()) {
    founder.updateRelation(liberator, LIBERATION_GOODWILL);
    liberator.updateRelation(founder, LIBERATION_GOODWILL);
  }
  mg.displayMessage(
    "events_display.province_liberated",
    MessageType.ALLIANCE_ACCEPTED,
    null,
    undefined,
    { province: name, player: liberator.displayName() },
  );
  return freed;
}

/**
 * One integration attempt: the tribe joins one time in INTEGRATION_ODDS and
 * becomes a province of the asker. Returns whether it joined.
 */
export function tryIntegrateTribe(
  mg: Game,
  asker: Player,
  tribe: Player,
): boolean {
  const roll = new PseudoRandom(
    simpleHash(asker.id()) + simpleHash(tribe.id()) * 31 + mg.ticks(),
  ).nextInt(0, INTEGRATION_ODDS);
  if (roll !== 0) {
    mg.displayMessage(
      "events_display.integration_refused",
      MessageType.ALLIANCE_REJECTED,
      asker.id(),
      undefined,
      { tribe: tribe.displayName() },
    );
    return false;
  }
  const tiles = [...tribe.tiles()];
  for (const t of tiles) asker.conquer(t);
  mg.provinces().createFrom(asker, tiles, tribe.displayName().slice(0, 32));
  mg.displayMessage(
    "events_display.integration_accepted",
    MessageType.ALLIANCE_ACCEPTED,
    null,
    undefined,
    { tribe: tribe.displayName(), player: asker.displayName() },
  );
  return true;
}
