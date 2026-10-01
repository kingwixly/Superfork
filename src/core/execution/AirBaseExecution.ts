import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { PseudoRandom } from "../PseudoRandom";
import { CivilianAircraftExecution } from "./CivilianAircraftExecution";

/**
 * Ceiling on civilian aircraft a single nation can have aloft.
 *
 * Raised back near the original after playtesting: the "too many planes"
 * report was largely the HEALTH BARS, which rendered as a red dot on every
 * aircraft and made a normal amount of traffic look like swarm. With those
 * hidden, the earlier cap of 6 left civilian air too sparse to rival ports.
 */
const MAX_CIVILIAN_AIRCRAFT = 36;
/** Civilian aircraft each base type adds to its nation's cap. */
const CIVILIAN_SLOTS_PER_INTERNATIONAL = 5;
const CIVILIAN_SLOTS_PER_AIRFIELD = 2;
/** Airfields fly regional routes: rarer than an international airport. */
const AIRFIELD_SPAWN_SLOWDOWN = 2.5;
/** Bases that send and receive civilian flights. */
const CIVILIAN_BASES = [UnitType.InternationalAirport, UnitType.Airfield];
/**
 * Multiplier on the trade-ship spawn interval for air traffic.
 *
 * Higher is rarer. Kept slightly above 1 because aircraft cross the map faster
 * than ships and so complete more trips per minute at the same spawn rate -
 * but only slightly, so air remains a real alternative to sea trade.
 */
const CIVILIAN_SPAWN_SLOWDOWN = 1;

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
    if (CIVILIAN_BASES.includes(this.base.type())) {
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
    const owner = this.base.owner();
    const mine =
      owner.units(UnitType.CargoJet).length +
      owner.units(UnitType.Airliner).length;
    const slots =
      owner.units(UnitType.InternationalAirport).length *
        CIVILIAN_SLOTS_PER_INTERNATIONAL +
      owner.units(UnitType.Airfield).length * CIVILIAN_SLOTS_PER_AIRFIELD;
    if (mine >= Math.min(MAX_CIVILIAN_AIRCRAFT, slots)) return;

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
        ) *
      CIVILIAN_SPAWN_SLOWDOWN *
      (this.base.type() === UnitType.Airfield ? AIRFIELD_SPAWN_SLOWDOWN : 1);
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
      .units(CIVILIAN_BASES)
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
