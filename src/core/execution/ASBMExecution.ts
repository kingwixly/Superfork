import { translateText } from "../../client/Utils";
import {
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
  Warships,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  AirPosition,
  airPositionOf,
  stepToward,
  tileOfAirPosition,
} from "./utils/AirMotion";

/** How many hulls one ASBM salvo can engage. */
export const ASBM_WARHEAD_COUNT = 12;

/**
 * Anti-Ship Ballistic Missile.
 *
 * MIRV-like in mechanism — one launch, many warheads — but strictly
 * anti-shipping: it picks out a single nation's hulls and ignores everything
 * else on the map. That narrowness is what keeps it from being a
 * general-purpose weapon at two-thirds the price of a MIRV.
 *
 * Targets are chosen by value, biggest hull first, so a salvo goes after
 * carriers and warships before it wastes warheads on corvettes.
 */
export class ASBMExecution implements Execution {
  private mg: Game;
  private active = true;

  constructor(
    private player: Player,
    private targetID: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (mg.hasPlayer(this.targetID)) {
      mg.displayMessage(
        translateText("events_display.asbm_inbound", {
          player: this.player.displayName(),
        }),
        MessageType.NUKE_INBOUND,
        this.targetID,
      );
    }
  }

  tick(ticks: number): void {
    this.active = false;
    if (!this.mg.hasPlayer(this.targetID)) return;
    const target = this.mg.player(this.targetID);
    if (target.id() === this.player.id()) return;

    // Firing on a nation is an act of war, exactly as a nuke is. Previously
    // hulls simply vanished with no diplomatic consequence at all, so an ASBM
    // was a free strike against an ally.
    const alliance = this.player.allianceWith(target);
    if (alliance !== null) {
      this.player.breakAlliance(alliance);
    }
    target.updateRelation(this.player, -100);

    // Value order: a salvo should sink the carrier, not the escorts.
    const priority = [
      UnitType.Carrier,
      UnitType.Warship,
      UnitType.Destroyer,
      UnitType.Corvette,
      UnitType.TradeShip,
      UnitType.TransportShip,
    ];

    // Launched from a ready silo, like every other warhead.
    const launchSite = this.player
      .units(UnitType.MissileSilo)
      .find((s) => s.isActive() && !s.isUnderConstruction());

    let remaining = ASBM_WARHEAD_COUNT;
    for (const type of priority) {
      if (remaining <= 0) break;
      for (const unit of target.units(type)) {
        if (remaining <= 0) break;
        if (!unit.isActive()) continue;
        const from = launchSite?.tile();
        const to = unit.tile();
        if (from !== undefined && to !== undefined) {
          // A real warhead that FLIES, rather than hulls silently vanishing.
          // Without this the weapon had no missile component at all - ships
          // just died, so there was nothing to see, intercept or react to.
          this.mg.addExecution(
            new ASBMWarheadExecution(this.player, from, unit),
          );
        } else {
          unit.delete(true, this.player);
        }
        remaining--;
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/**
 * A single ASBM warhead in flight.
 *
 * Travels from the launch site to its assigned hull and kills it on arrival.
 * Registered as a unit so it is visible, and so interceptors and warship
 * interception can engage it like any other warhead.
 */
export class ASBMWarheadExecution implements Execution {
  private mg: Game;
  private active = true;
  private warhead: Unit | undefined;
  private pos: AirPosition | undefined;

  constructor(
    private player: Player,
    private from: TileRef,
    private target: Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.warhead = this.player.buildUnit(UnitType.ASBMWarhead, this.from, {
      targetUnit: this.target,
      trajectory: [],
    });
    this.pos = airPositionOf(mg, this.from);
  }

  tick(ticks: number): void {
    const warhead = this.warhead;
    if (warhead === undefined || !warhead.isActive()) {
      this.active = false;
      return;
    }
    if (!this.target.isActive()) {
      warhead.delete(false);
      this.active = false;
      return;
    }

    const dest = this.target.tile();
    if (dest === undefined) {
      warhead.delete(false);
      this.active = false;
      return;
    }

    // Straight-line run at a fixed rate. Ships move, so the destination is
    // re-read every tick rather than baked at launch.
    const pos = this.pos;
    if (pos === undefined) return;
    const arrived = stepToward(
      pos,
      airPositionOf(this.mg, dest),
      ASBM_WARHEAD_SPEED,
    );
    warhead.move(tileOfAirPosition(this.mg, pos));

    if (arrived) {
      this.target.delete(true, this.player);
      // Marked reached so the FX layer draws a detonation rather than the
      // SAM-interception shockwave it uses for warheads killed in flight.
      warhead.setReachedTarget();
      warhead.delete(false);
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/** Tiles per tick for an ASBM warhead. */
const ASBM_WARHEAD_SPEED = 6;

/** Hull types an ASBM will engage, for UI and targeting checks. */
export const ASBM_TARGETS = [...Warships.types, UnitType.TradeShip];
