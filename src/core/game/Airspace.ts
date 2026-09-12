import { Game, Player, TerraNullius } from "./Game";
import { TileRef } from "./GameMap";

/**
 * Airspace (superfork).
 *
 * A nation's airspace is exactly its territory — every tile it owns, land or
 * the water inside its borders. There is no separate airspace claim to
 * maintain: territory changes hands constantly, and a parallel structure would
 * drift out of sync with it within a tick.
 *
 * **Airspace is open by default.** Anyone may overfly anyone. It closes only
 * where the owner has explicitly sanctioned the flier. That default matters:
 * the alternative (closed unless allied) would ground civilian traffic across
 * most of the map and make airports worthless, and it would make sanctions
 * meaningless by making restriction the norm.
 */

/** Who owns the airspace over a tile, or TerraNullius where nobody does. */
export function airspaceOwner(mg: Game, tile: TileRef): Player | TerraNullius {
  return mg.owner(tile);
}

/**
 * Whether `flier` may fly over `tile`.
 *
 * Open unless the tile's owner sanctions the flier. Unowned airspace is always
 * open, and nobody is ever restricted from their own airspace — including when
 * a sanctioning nation's own aircraft are inside it.
 */
export function canFlyOver(mg: Game, flier: Player, tile: TileRef): boolean {
  const owner = mg.owner(tile);
  if (!owner.isPlayer()) return true;
  const ownerPlayer = owner as Player;
  if (ownerPlayer.id() === flier.id()) return true;
  return !ownerPlayer.hasSanctionAgainst(flier);
}

/**
 * Whether any part of the straight-line path from `src` to `dst` crosses
 * airspace closed to `flier`.
 *
 * Sampled rather than walked tile by tile: a long flight can span hundreds of
 * tiles and this is called per aircraft per tick. Sampling every
 * `SAMPLE_STRIDE` tiles catches any restricted territory large enough to
 * matter — a nation whose airspace is narrower than the stride is too small to
 * enforce it anyway. Sampling is deterministic (fixed stride, integer
 * arithmetic), so every client reaches the same verdict.
 */
export const SAMPLE_STRIDE = 4;

export function pathCrossesRestrictedAirspace(
  mg: Game,
  flier: Player,
  src: TileRef,
  dst: TileRef,
): boolean {
  const map = mg.map();
  const w = map.width();
  const x0 = src % w;
  const y0 = (src / w) | 0;
  const x1 = dst % w;
  const y1 = (dst / w) | 0;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return !canFlyOver(mg, flier, src);

  for (let i = 0; i <= steps; i += SAMPLE_STRIDE) {
    // Integer division keeps this identical across clients; floating
    // interpolation here would be a desync waiting to happen.
    const x = x0 + Math.trunc((dx * i) / steps);
    const y = y0 + Math.trunc((dy * i) / steps);
    if (x < 0 || y < 0 || x >= w || y >= map.height()) continue;
    if (!canFlyOver(mg, flier, map.ref(x, y))) return true;
  }
  // Always test the endpoint — the stride can skip it.
  return !canFlyOver(mg, flier, dst);
}
