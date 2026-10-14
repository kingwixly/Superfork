import { UnitType } from "@openfront/engine-api/game/GameTypes";

/** Anything that can list a player's capitals: the engine Player or a client PlayerView. */
export interface CapitalOwner {
  units(type: UnitType.Capital): ReadonlyArray<{ capitalName(): string }>;
}

/**
 * The display name of a player's capital (superfork), or null when the
 * player has no capital or has not named it.
 *
 * Used by the nation-info panel. Falls back to nothing rather than a
 * placeholder, so an unnamed capital simply does not add a line.
 */
export function capitalDisplayName(player: CapitalOwner): string | null {
  const capital = player.units(UnitType.Capital)[0];
  if (capital === undefined) return null;
  const name = capital.capitalName();
  return name.length > 0 ? name : null;
}
