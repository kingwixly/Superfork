import { Game, Player, PlayerType } from "./Game";

/**
 * UCI developer-tool state that outlives a single intent: the cheat toggles,
 * attack locks and the forced AI answer.
 *
 * Kept here rather than on Player so the dozens of Player implementations
 * and their wire updates stay untouched. Keyed by the live Player / Game
 * objects, so it is per game and disappears with it. Every client applies
 * the same intents in the same order, so it stays deterministic.
 */

const infiniteGold = new WeakSet<Player>();
const infiniteTroops = new WeakSet<Player>();
const attackLocked = new WeakSet<Player>();
const aiAnswers = new WeakMap<Game, "yes" | "no">();

function toggle(set: WeakSet<Player>, player: Player, on: boolean): void {
  if (on) set.add(player);
  else set.delete(player);
}

export function setUciInfiniteGold(player: Player, on: boolean): void {
  toggle(infiniteGold, player, on);
}
export function hasUciInfiniteGold(player: Player): boolean {
  return infiniteGold.has(player);
}

export function setUciInfiniteTroops(player: Player, on: boolean): void {
  toggle(infiniteTroops, player, on);
}
export function hasUciInfiniteTroops(player: Player): boolean {
  return infiniteTroops.has(player);
}

/** A locked country cannot start an attack of any kind. */
export function setAttackLocked(player: Player, on: boolean): void {
  toggle(attackLocked, player, on);
}
export function isAttackLocked(player: Player): boolean {
  return attackLocked.has(player);
}

export function setUciAiAnswers(
  game: Game,
  mode: "yes" | "no" | "normal",
): void {
  if (mode === "normal") aiAnswers.delete(game);
  else aiAnswers.set(game, mode);
}

/**
 * How an AI must answer a request from `from`: true (yes), false (no), or
 * null to decide normally. Only requests from human players are forced, so
 * AIs dealing with each other are unaffected.
 */
export function forcedAiAnswer(game: Game, from: Player): boolean | null {
  const mode = aiAnswers.get(game);
  if (mode === undefined || from.type() !== PlayerType.Human) return null;
  return mode === "yes";
}
