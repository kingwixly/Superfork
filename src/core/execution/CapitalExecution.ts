import {
  CAPITAL_LOCKING_STRUCTURES,
  STACK_RADIUS,
} from "../configuration/SuperforkUnits";
import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { MAX_USERNAME_LENGTH, validateUsername } from "../validations/username";

/**
 * Returns the structures stacked on a capital's site — anything of a stacking
 * type sitting within STACK_RADIUS of it. See SuperforkUnits.canStack for why
 * stacking is proximity-based rather than a container on the tile.
 */
export function stackedStructures(mg: Game, capital: Unit): Unit[] {
  const tile = capital.tile();
  if (tile === undefined) return [];
  return mg
    .nearbyUnits(tile, STACK_RADIUS, CAPITAL_LOCKING_STRUCTURES)
    .map(({ unit }) => unit)
    .filter((u) => u.owner() === capital.owner() && u !== capital);
}

/**
 * Whether a capital may be demoted.
 *
 * Dani's rule: a capital is released only by destruction, or while it is
 * still a plain capital. Once a Port or International Airport is stacked onto
 * it the choice is locked in, and the only way to move your capital is to
 * lose the one you have. That is what makes capital placement a real
 * commitment rather than a free toggle.
 */
export function canDemoteCapital(mg: Game, capital: Unit): boolean {
  return stackedStructures(mg, capital).length === 0;
}

/** Promote an owned City into this nation's Capital. One capital per nation. */
export class PromoteCapitalExecution implements Execution {
  private mg: Game;
  private active = true;

  constructor(
    private player: Player,
    private cityUnitId: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    this.active = false;

    const city = this.player
      .units(UnitType.City)
      .find((u) => u.id() === this.cityUnitId);
    if (city === undefined || !city.isActive()) {
      console.warn(`promote_capital: city ${this.cityUnitId} not found`);
      return;
    }
    if (city.isUnderConstruction()) {
      return;
    }
    // One per nation.
    if (this.player.units(UnitType.Capital).length > 0) {
      return;
    }

    // Affordability must be checked HERE. Every other build path goes through
    // canBuild, which gates on cost; a promotion is not a build, so it skips
    // that. And removeGold clamps to the balance rather than failing, so
    // without this a broke player promotes for free and simply loses whatever
    // gold they had.
    const cost = this.mg
      .config()
      .unitInfo(UnitType.Capital)
      .cost(this.mg, this.player);
    if (this.player.gold() < cost) {
      return;
    }

    const tile = city.tile();
    if (tile === undefined) return;

    // Promotion replaces the city rather than adding alongside it, so the
    // site does not end up counted as both. The city's level carries over —
    // promoting a developed city should not throw away that investment.
    const level = city.level();
    city.delete(false);
    const capital = this.player.buildUnit(UnitType.Capital, tile, {});
    for (let i = 1; i < level; i++) {
      capital.increaseLevel();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/** Longest permitted capital name. Matches the username cap. */
export const MAX_CAPITAL_NAME_LENGTH = MAX_USERNAME_LENGTH;

/**
 * Name or rename your capital.
 *
 * Validated through the same path usernames use, because it is displayed to
 * other players in the nation-info panel and so carries the same abuse risk.
 * An empty name is legal and simply clears it back to the default.
 */
export class RenameCapitalExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private unitId: number,
    private name: string,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;

    const capital = this.player
      .units(UnitType.Capital)
      .find((u) => u.id() === this.unitId);
    if (capital === undefined || !capital.isActive()) return;

    const trimmed = this.name.trim();
    if (trimmed.length === 0) {
      capital.setCapitalName("");
      return;
    }
    if (trimmed.length > MAX_CAPITAL_NAME_LENGTH) return;
    if (!validateUsername(trimmed).isValid) return;

    capital.setCapitalName(trimmed);
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/**
 * The capital's display name for a player, or null if they have none.
 *
 * Used by the nation-info panel. Falls back to nothing rather than a
 * placeholder, so an unnamed capital simply does not add a line.
 */
export function capitalDisplayName(player: Player): string | null {
  const capital = player.units(UnitType.Capital)[0];
  if (capital === undefined) return null;
  const name = capital.capitalName();
  return name.length > 0 ? name : null;
}

/** Demote a Capital back to a City, if the stacking rule permits it. */
export class DemoteCapitalExecution implements Execution {
  private mg: Game;
  private active = true;

  constructor(
    private player: Player,
    private capitalUnitId: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    this.active = false;

    const capital = this.player
      .units(UnitType.Capital)
      .find((u) => u.id() === this.capitalUnitId);
    if (capital === undefined || !capital.isActive()) {
      return;
    }
    if (!canDemoteCapital(this.mg, capital)) {
      // Locked by a stacked port or airport. Refused silently: the UI is
      // responsible for not offering the option in the first place.
      return;
    }

    const tile = capital.tile();
    if (tile === undefined) return;

    const level = capital.level();
    capital.delete(false);
    const city = this.player.buildUnit(UnitType.City, tile, {});
    for (let i = 1; i < level; i++) {
      city.increaseLevel();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
