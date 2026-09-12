import { Player, Unit, UnitType } from "../game/Game";
import { AircraftExecution } from "./AircraftExecution";
import { airDistanceTiles, airPositionOf } from "./utils/AirMotion";

/**
 * Cargo jets and airliners.
 *
 * The air analogue of trade ships: spawned by International Airports rather
 * than bought, they fly to another airport and pay out on arrival. Three
 * things make them worth building airports for, and worth hunting:
 *
 *  - Payout scales with distance flown, so long-haul routes are the valuable
 *    ones and a nation with distant partners out-earns a compact one.
 *  - Both endpoints are paid when the destination belongs to someone else -
 *    an open-borders pair both profit, which is the incentive to open up.
 *  - They are capturable. A fighter that takes one redirects the whole payout,
 *    which is why civilian traffic is a target rather than scenery.
 */
export class CivilianAircraftExecution extends AircraftExecution {
  private tilesTravelled = 0;
  private delivered = false;

  constructor(
    unit: Unit,
    home: Unit | undefined,
    private dstAirport: Unit,
  ) {
    super(unit, home);
  }

  protected decide(ticks: number): void {
    if (this.delivered) return;

    // The destination can be destroyed or captured mid-flight. If it stops
    // accepting us, divert home rather than vanishing - a flight already in
    // the air is not cancelled by paperwork.
    if (!this.dstAirport.isActive() || !this.destinationStillOpen()) {
      this.returnToBase();
      return;
    }

    const tile = this.dstAirport.tile();
    if (tile !== undefined) this.destination = tile;
  }

  private destinationStillOpen(): boolean {
    const dstOwner = this.dstAirport.owner();
    return dstOwner.acceptsCivilianFlightsFrom(this.unit.owner());
  }

  protected onArrived(): void {
    if (this.delivered) return;
    this.delivered = true;

    const srcTile = this.home?.tile();
    const dstTile = this.dstAirport.tile();
    if (dstTile !== undefined && srcTile !== undefined) {
      this.tilesTravelled = airDistanceTiles(
        airPositionOf(this.mg, srcTile),
        airPositionOf(this.mg, dstTile),
      );
    }

    const flier = this.unit.owner();
    const gold = this.mg
      .config()
      .tradeShipGold(this.tilesTravelled, flier) as bigint;

    // Airliners carry people rather than freight, so they earn less per tile
    // than cargo. Kept as a flat ratio rather than a separate formula - one
    // payout curve is easier to balance than two.
    const payout =
      this.unit.type() === UnitType.Airliner ? (gold * 3n) / 4n : gold;

    flier.addGold(payout, dstTile);

    const dstOwner = this.dstAirport.owner();
    if (dstOwner.isPlayer() && (dstOwner as Player).id() !== flier.id()) {
      // Both ends profit from an international route.
      (dstOwner as Player).addGold(payout, dstTile);
    }

    this.unit.delete(false);
    this.active = false;
  }
}
