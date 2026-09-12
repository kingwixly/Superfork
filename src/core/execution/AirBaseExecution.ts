import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { CivilianAircraftExecution } from "./CivilianAircraftExecution";

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
  private random: PseudoRandom;
  /** Consecutive failed spawn rolls, feeding the same pity timer trade uses. */
  private spawnRejections = 0;

  constructor(private base: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    // Seeded from the unit id so every client generates the same traffic in
    // the same ticks. Math.random here would desync the whole game.
    this.random = new PseudoRandom(this.base.id());
  }

  tick(ticks: number): void {
    if (!this.base.isActive()) {
      this.active = false;
      return;
    }
    if (this.base.type() === UnitType.InternationalAirport) {
      this.maybeLaunchCivilian();
    }
  }

  /**
   * Civilian traffic spawns on the same throttle as trade ships, so the air
   * economy scales like the sea one rather than needing its own tuning.
   */
  private maybeLaunchCivilian(): void {
    if (this.base.isUnderConstruction()) return;
    const rate = this.mg
      .config()
      .tradeShipSpawnRate(
        this.spawnRejections,
        this.mg.units(UnitType.CargoJet).length +
          this.mg.units(UnitType.Airliner).length,
      );
    if (!this.random.chance(rate)) {
      this.spawnRejections++;
      return;
    }
    this.spawnRejections = 0;

    const dst = this.pickDestination();
    if (dst === undefined) return;

    const tile = this.base.tile();
    if (tile === undefined) return;

    // Cargo and passengers roughly evenly; they differ only in payout.
    const type = this.random.chance(2) ? UnitType.CargoJet : UnitType.Airliner;
    const aircraft = this.base.owner().buildUnit(type, tile, {
      targetUnit: dst,
      homeBase: this.base,
    });
    this.mg.addExecution(
      new CivilianAircraftExecution(aircraft, this.base, dst),
    );
  }

  /**
   * A destination airport that will accept us.
   *
   * Per spec: allied nations with international airports, or any nation that
   * has opened both border trade and public airports. Our own airports count
   * too - domestic routes are legitimate, just short and so low-paying.
   */
  private pickDestination(): Unit | undefined {
    const me: Player = this.base.owner();
    const candidates = this.mg
      .units(UnitType.InternationalAirport)
      .filter(
        (a) =>
          a !== this.base &&
          a.isActive() &&
          !a.isUnderConstruction() &&
          a.owner().acceptsCivilianFlightsFrom(me),
      );
    if (candidates.length === 0) return undefined;
    return candidates[this.random.nextInt(0, candidates.length)];
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
