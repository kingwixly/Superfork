import { Game, Unit } from "../../game/Game";
import { TileRef } from "../../game/GameMap";

/**
 * Air movement (superfork).
 *
 * Every existing mobile unit in this game is bound to terrain: boats path
 * through water components, trains follow rails, ground attacks flood across
 * owned tiles. Aircraft are the first units that ignore all of it and fly
 * straight to their target.
 *
 * That makes the movement itself simple — no pathfinding — but it puts the
 * whole burden on determinism. The sim runs in lockstep across every client
 * and `DesyncDetector` compares state hashes, so this is integer-only:
 * position is tracked as a scaled integer (`POS_SCALE` sub-tile units) rather
 * than a float, because accumulating floats across hundreds of ticks is
 * exactly the kind of drift that diverges one client from the rest.
 */

/** Sub-tile resolution for air positions. Power of two for exact division. */
export const POS_SCALE = 256;

export interface AirPosition {
  /** Scaled X: true tile X = x / POS_SCALE. */
  x: number;
  /** Scaled Y: true tile Y = y / POS_SCALE. */
  y: number;
}

export function airPositionOf(mg: Game, tile: TileRef): AirPosition {
  const w = mg.map().width();
  return { x: (tile % w) * POS_SCALE, y: ((tile / w) | 0) * POS_SCALE };
}

export function tileOfAirPosition(mg: Game, pos: AirPosition): TileRef {
  const map = mg.map();
  const x = Math.min(
    map.width() - 1,
    Math.max(0, Math.trunc(pos.x / POS_SCALE)),
  );
  const y = Math.min(
    map.height() - 1,
    Math.max(0, Math.trunc(pos.y / POS_SCALE)),
  );
  return map.ref(x, y);
}

/**
 * Advance `pos` toward `target` by `speed` tiles, in place.
 *
 * Returns true once the target is reached. Speed is given in tiles per tick
 * and converted to scaled units up front; the per-axis step is computed with
 * integer division so two clients stepping the same unit produce bit-identical
 * positions.
 */
export function stepToward(
  pos: AirPosition,
  target: AirPosition,
  speedTilesPerTick: number,
): boolean {
  const step = Math.max(1, Math.trunc(speedTilesPerTick * POS_SCALE));
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;

  // Chebyshev rather than Euclidean: no square root, so no floating point,
  // and diagonal flight costs the same as axial — which for aircraft reads
  // correctly anyway.
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (dist <= step) {
    pos.x = target.x;
    pos.y = target.y;
    return true;
  }

  pos.x += Math.trunc((dx * step) / dist);
  pos.y += Math.trunc((dy * step) / dist);
  return false;
}

/** Chebyshev distance in whole tiles between two air positions. */
export function airDistanceTiles(a: AirPosition, b: AirPosition): number {
  return Math.trunc(
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / POS_SCALE,
  );
}

/**
 * Whether `unit` is still within operating range of `home`.
 *
 * Aircraft are tied to the base that launched them; range comes from the
 * base's spec, not the aircraft's, so an airstrip's fighters reach less far
 * than an airport's even though it is the same airframe.
 */
export function withinBaseRange(
  mg: Game,
  unit: Unit,
  home: Unit,
  pos: AirPosition,
): boolean {
  const range = mg.config().unitInfo(home.type()).range ?? 0;
  if (range <= 0) return true;
  const homeTile = home.tile();
  if (homeTile === undefined) return false;
  return airDistanceTiles(pos, airPositionOf(mg, homeTile)) <= range;
}
