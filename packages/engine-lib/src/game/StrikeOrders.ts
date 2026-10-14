import { UnitType } from "@openfront/engine-api/game/GameTypes";

/**
 * Strategic bomber orders (Phase 39): which bomber flies a strike and what it
 * drops. Pure lookups, shared by the engine (pricing, executions) and the
 * client (build previews). The bomber registry stays in the engine's
 * StrikeBombers.ts.
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
