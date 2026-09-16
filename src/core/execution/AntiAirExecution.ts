import { Execution, Game, Unit, UnitType } from "../game/Game";

/** Aircraft ground-based air defence will engage. */
export const ANTI_AIR_TARGETS: UnitType[] = [
  UnitType.FighterJet,
  UnitType.TransportJet,
  UnitType.Bomber,
];

/** Engagement radius, in tiles. */
export const DESTROYER_AA_RANGE = 35;
export const DEFENSE_POST_AA_RANGE = 25;
/** Ticks between shots. */
export const ANTI_AIR_COOLDOWN = 40;

/**
 * Anti-air for destroyers and defense posts.
 *
 * Two problems this solves at once, both from playtesting:
 *
 *  - **Destroyers had no identity.** Warship was strictly better - same role,
 *    more health, plus nuke interception - so a destroyer was only ever the
 *    cheap version. Anti-air gives it a job a warship cannot do.
 *  - **Aircraft were untouchable from the ground.** Only SAM launchers could
 *    engage them, so land and air were two games running side by side.
 *
 * Interceptors and civilian traffic are deliberately NOT targets. If ground
 * fire killed everything that flies, the dominant strategy is to skip an air
 * force entirely and build air defence - and the interceptor's counter has to
 * stay the fighter, or nothing needs an air force at all.
 */
export class AntiAirExecution implements Execution {
  private mg: Game;
  private active = true;
  private lastShot = 0;

  constructor(
    private platform: Unit,
    private range: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.platform.isActive()) {
      this.active = false;
      return;
    }
    if (this.platform.isUnderConstruction() || this.platform.isDisabled()) {
      return;
    }
    if (ticks - this.lastShot < ANTI_AIR_COOLDOWN) return;

    // Global early-out before any spatial query - the same mistake that
    // collapsed the tick rate in Phase 9 is very easy to repeat here.
    let anyAircraft = false;
    for (const t of ANTI_AIR_TARGETS) {
      if (this.mg.unitCount(t) > 0) {
        anyAircraft = true;
        break;
      }
    }
    if (!anyAircraft) return;

    const tile = this.platform.tile();
    if (tile === undefined) return;
    const owner = this.platform.owner();

    const target = this.mg
      .nearbyUnits(tile, this.range, ANTI_AIR_TARGETS)
      .filter(
        ({ unit }) =>
          unit.isActive() &&
          unit.owner().id() !== owner.id() &&
          !owner.isFriendly(unit.owner()),
      )
      .sort((a, b) => a.distSquared - b.distSquared)[0];
    if (target === undefined) return;

    target.unit.delete(true, owner);
    this.lastShot = ticks;
  }

  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
