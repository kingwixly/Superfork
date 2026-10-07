import { Game, Player, Unit, UnitType } from "./Game";
import { TileRef } from "./GameMap";

/**
 * Strategic bombers (Phase 39): who flies which strike, and what it costs.
 *
 * Both bombers are reusable. A strike order goes to an idle bomber of the
 * right kind if the player has one, and only buys a new airframe when they
 * do not. The registry below is how an order finds the execution flying a
 * given bomber; it lives here, not in the execution file, because Config
 * prices orders by it and must not import executions.
 */

export type StrikeOrder =
  | UnitType.BlindingBomb
  | UnitType.BunkerBuster
  | UnitType.BomberAtomDrop
  | UnitType.BomberHydrogenDrop;

export type StrikeBomberType = UnitType.StealthBomber | UnitType.LargeBomber;

/** What a bomber releases over the target. */
export type StrikePayload =
  | UnitType.BlindingBomb
  | UnitType.BunkerBuster
  | UnitType.AtomBomb
  | UnitType.HydrogenBomb;

export function isStrikeOrder(type: UnitType): type is StrikeOrder {
  return (
    type === UnitType.BlindingBomb ||
    type === UnitType.BunkerBuster ||
    type === UnitType.BomberAtomDrop ||
    type === UnitType.BomberHydrogenDrop
  );
}

/** The bomber that flies an order. */
export function bomberFor(order: StrikeOrder): StrikeBomberType {
  return order === UnitType.BlindingBomb || order === UnitType.BunkerBuster
    ? UnitType.StealthBomber
    : UnitType.LargeBomber;
}

/** The munition an order releases. */
export function payloadFor(order: StrikeOrder): StrikePayload {
  switch (order) {
    case UnitType.BomberAtomDrop:
      return UnitType.AtomBomb;
    case UnitType.BomberHydrogenDrop:
      return UnitType.HydrogenBomb;
    default:
      return order;
  }
}

/** The execution flying a bomber, as far as orders need to know it. */
export interface StrikeBomberControl {
  bomber(): Unit;
  /** Carrying a payload toward a target. */
  busy(): boolean;
  assign(payload: StrikePayload, target: TileRef): void;
}

const flying = new WeakMap<Unit, StrikeBomberControl>();

export function registerStrikeBomber(control: StrikeBomberControl): void {
  flying.set(control.bomber(), control);
}

/**
 * The idle bomber of `type` nearest `target`, or null. Deterministic: the
 * player's unit list order breaks ties.
 */
export function idleStrikeBomber(
  game: Game,
  player: Player,
  type: StrikeBomberType,
  target: TileRef,
): StrikeBomberControl | null {
  let best: StrikeBomberControl | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const unit of player.units(type)) {
    if (!unit.isActive()) continue;
    const control = flying.get(unit);
    if (control === undefined || control.busy()) continue;
    const d = game.manhattanDist(unit.tile(), target);
    if (d < bestDist) {
      bestDist = d;
      best = control;
    }
  }
  return best;
}

/** Whether `player` has a bomber of `type` free to fly a strike. */
export function hasIdleStrikeBomber(
  player: Player,
  type: StrikeBomberType,
): boolean {
  return player.units(type).some((unit) => {
    const control = flying.get(unit);
    return unit.isActive() && control !== undefined && !control.busy();
  });
}
