import { PseudoRandom } from "../../PseudoRandom";
import { Game, Player, UnitType } from "../../game/Game";
import { AirBaseExecution } from "../AirBaseExecution";
import { FighterJetExecution } from "../FighterJetExecution";
import { InterceptorExecution } from "../InterceptorExecution";

/**
 * Nation AI air wing.
 *
 * The structure behaviour already builds airstrips, airfields and airports;
 * without this they would sit empty, which looks worse than not having them.
 *
 * Composition is deliberately defensive. A bot flying transport assaults it
 * cannot follow up on wastes its army; fighters and interceptors defend the
 * airspace it already holds, which is both simpler to get right and reads as
 * intentional. Offensive air is left to human players.
 */
export class NationAirBehavior {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
  ) {}

  maybeLaunchAircraft(): boolean {
    // Throttled like the warship behaviour so air does not crowd out the rest
    // of a nation's spending in any given tick.
    if (!this.random.chance(60)) return false;

    const bases = [
      ...this.player.units(UnitType.Airstrip),
      ...this.player.units(UnitType.Airfield),
      ...this.player.units(UnitType.InternationalAirport),
      ...this.player.units(UnitType.Carrier),
    ].filter((b) => !b.isUnderConstruction() && !b.isDisabled());
    if (bases.length === 0) return false;

    const type = this.nextAircraft(bases.length);
    if (type === null) return false;

    // Only a base that may actually launch this type.
    const usable = bases.filter((b) => {
      const exec = new AirBaseExecution(b);
      exec.init(this.game, 0);
      return exec.canLaunch(type);
    });
    if (usable.length === 0) return false;

    const base = this.random.randElement(usable);
    const tile = base.tile();
    if (tile === undefined) return false;
    if (
      this.player.gold() <
      this.game.config().unitInfo(type).cost(this.game, this.player)
    ) {
      return false;
    }

    const unit = this.player.buildUnit(type, tile, {
      patrolTile: tile,
      homeBase: base,
    });
    this.game.addExecution(
      type === UnitType.Interceptor
        ? new InterceptorExecution(unit, base, tile)
        : new FighterJetExecution(unit, base, tile),
    );
    return true;
  }

  /**
   * Fighters first, then one interceptor once there is cover for it.
   *
   * An interceptor with no fighter escort is free kills for anyone with an
   * air force - it carries no air-to-air weapon at all - so a bot that buys
   * one first has simply wasted the money.
   */
  private nextAircraft(baseCount: number): UnitType | null {
    const config = this.game.config();
    const fighters = this.player.units(UnitType.FighterJet).length;
    const interceptors = this.player.units(UnitType.Interceptor).length;

    const cap = Math.min(5, baseCount * 2);
    if (fighters + interceptors >= cap) return null;

    if (!config.isUnitDisabled(UnitType.FighterJet) && fighters < 2) {
      return UnitType.FighterJet;
    }
    if (
      !config.isUnitDisabled(UnitType.Interceptor) &&
      fighters > 0 &&
      interceptors === 0
    ) {
      return UnitType.Interceptor;
    }
    if (!config.isUnitDisabled(UnitType.FighterJet)) {
      return UnitType.FighterJet;
    }
    return null;
  }
}
