import { translateText } from "../../client/Utils";
import {
  Execution,
  Game,
  MessageType,
  Player,
  UnitType,
  Warships,
} from "../game/Game";

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

    // Value order: a salvo should sink the carrier, not the escorts.
    const priority = [
      UnitType.Carrier,
      UnitType.Warship,
      UnitType.Destroyer,
      UnitType.Corvette,
      UnitType.TradeShip,
      UnitType.TransportShip,
    ];

    let remaining = ASBM_WARHEAD_COUNT;
    for (const type of priority) {
      if (remaining <= 0) break;
      for (const unit of target.units(type)) {
        if (remaining <= 0) break;
        if (!unit.isActive()) continue;
        unit.delete(true, this.player);
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

/** Hull types an ASBM will engage, for UI and targeting checks. */
export const ASBM_TARGETS = [...Warships.types, UnitType.TradeShip];
