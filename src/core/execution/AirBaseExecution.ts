import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { CivilianAircraftExecution } from "./CivilianAircraftExecution";

/** Ceiling on civilian aircraft a single nation can have aloft. */
const MAX_CIVILIAN_AIRCRAFT = 6;
/**
 * Multiplier on the trade-ship spawn interval for air traffic.
 *
 * Higher is rarer. Aircraft cross the map several times faster than ships, so
 * an identical spawn rate yields far more completed trips - and far more
 * income - per minute.
 */
const CIVILIAN_SPAWN_SLOWDOWN = 4;

/**
 * Lifecycle for the air bases: Airstrip, Airfield, International Airport, and
 * the Carrier, which is an airstrip that floats.
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
    if (this.base.isUnderConstruction() || this.base.isDisabled()) return;
    // Hard cap per airport first. Civilian traffic is flavour and income, not
    // a fleet - without a ceiling every airport kept minting until the sky was
    // full, which is what shipped.
    const mine =
      this.base.owner().units(UnitType.CargoJet).length +
      this.base.owner().units(UnitType.Airliner).length;
    const airports = this.base
      .owner()
      .units(UnitType.InternationalAirport).length;
    if (mine >= Math.min(MAX_CIVILIAN_AIRCRAFT, airports * 2)) return;

    // Then the shared trade throttle, slowed further: the trade rate is tuned
    // for ports serving a whole nation, and aircraft fly far faster than
    // ships, so the same rate produces many more completed trips per minute.
    const rate =
      this.mg
        .config()
        .tradeShipSpawnRate(
          this.spawnRejections,
          this.mg.units(UnitType.CargoJet).length +
            this.mg.units(UnitType.Airliner).length,
        ) * CIVILIAN_SPAWN_SLOWDOWN;
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
    // An EMP burst grounds everything until it wears off.
    if (this.base.isDisabled()) return false;
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
      case UnitType.Carrier:
        // A mobile airstrip. Fighters and interceptors only - no runway for
        // heavy transport, and no civilian traffic would file to a warship.
        return type === UnitType.FighterJet || type === UnitType.Interceptor;
      default:
        return false;
    }
  }
}
