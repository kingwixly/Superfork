import { Execution, Game, Unit, UnitType } from "../game/Game";

/**
 * Lifecycle for the three air bases (Airstrip, Airfield, International
 * Airport).
 *
 * They share one execution because at this stage they differ only in what they
 * are permitted to launch and how far — both of which are data in
 * SuperforkUnits.ts, not behaviour. Sortie generation and civilian traffic land
 * later in Phase 3; splitting this into three near-identical files before there
 * is any divergence would be noise.
 */
export class AirBaseExecution implements Execution {
  private mg: Game;
  private active: boolean = true;

  constructor(private base: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.base.isActive()) {
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  /** Operating radius for this base's aircraft, in tiles. */
  range(): number {
    return this.mg.config().unitInfo(this.base.type()).range ?? 0;
  }

  /** Whether this base may launch the given aircraft type. */
  canLaunch(type: UnitType): boolean {
    switch (this.base.type()) {
      case UnitType.Airstrip:
        // Fighters only — the cheap forward air-defence option.
        return type === UnitType.FighterJet;
      case UnitType.Airfield:
        // Military transport, plus its own fighter cover.
        return type === UnitType.TransportJet || type === UnitType.FighterJet;
      case UnitType.InternationalAirport:
        // Civilian traffic and any military type.
        return true;
      default:
        return false;
    }
  }
}
