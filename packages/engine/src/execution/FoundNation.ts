import { TileRef } from "@openfront/engine-api/game/GameMap";
import {
  Nation,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import type { ClientID } from "@openfront/engine-api/Schemas";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { simpleHash } from "@openfront/engine-lib/Util";
import { Game, Player } from "../game/Game";
import { NationExecution } from "./NationExecution";
import { PlayerExecution } from "./PlayerExecution";

/** Share of its troop ceiling a newly founded country starts with. */
export const FOUNDED_TROOP_SHARE = 0.35;
/** Longest name a founded country gets. */
export const MAX_FOUNDED_NAME = 32;

export type Founder =
  /** An AI nation. */
  | { kind: "nation" }
  /** A human: a spectator joining, or a dead player brought back. */
  | { kind: "human"; clientID: ClientID };

/**
 * Put a new country on the map mid-game, holding `tiles`.
 *
 * Shared by the UCI country painter, province breakaways and province
 * liberation. Must be called from an execution's tick(), never its init():
 * executions queued from inside another init are dropped by GameImpl.
 *
 * A human founder that already has a (dead) player gets that player back
 * rather than a second one, so the client's "my player" lookup by clientID
 * keeps working. Returns null when there is nothing to found.
 */
export function foundNation(
  mg: Game,
  name: string,
  tiles: readonly TileRef[],
  founder: Founder,
): Player | null {
  const land = tiles.filter((t) => mg.isLand(t) && !mg.isImpassable(t));
  if (land.length === 0) return null;
  const cleanName =
    name.trim().slice(0, MAX_FOUNDED_NAME) || `Free State ${mg.ticks()}`;

  let player: Player | null = null;
  let needsExecution = true;
  if (founder.kind === "human") {
    player = mg.playerByClientID(founder.clientID);
    // A living player keeps their running PlayerExecution.
    if (player !== null && player.isAlive()) needsExecution = false;
  }

  if (player === null) {
    const random = new PseudoRandom(
      simpleHash(cleanName) + mg.ticks() * 7919 + land[0],
    );
    let id = random.nextID();
    while (mg.hasPlayer(id)) id = random.nextID();
    const info = new PlayerInfo(
      cleanName,
      founder.kind === "human" ? PlayerType.Human : PlayerType.Nation,
      founder.kind === "human" ? founder.clientID : null,
      id,
    );
    player = mg.addPlayer(info);
    if (founder.kind === "nation") {
      // NationExecution finds the player already added and runs its AI. A
      // spawn cell is only used during the spawn phase, which is over.
      mg.addExecution(
        new NationExecution(
          `founded${mg.ticks()}`,
          new Nation(undefined, info),
        ),
      );
    }
  }

  for (const t of land) {
    if (mg.owner(t) !== player) player.conquer(t);
  }
  player.setSpawnTile(centerOf(mg, land));
  if (needsExecution) mg.addExecution(new PlayerExecution(player));
  const max = mg.config().maxTroops(player);
  player.setTroops(
    Math.max(player.troops(), Math.floor(max * FOUNDED_TROOP_SHARE)),
  );
  return player;
}

/** The land tile closest to the middle of `tiles`. */
function centerOf(mg: Game, tiles: readonly TileRef[]): TileRef {
  let sx = 0;
  let sy = 0;
  for (const t of tiles) {
    sx += mg.x(t);
    sy += mg.y(t);
  }
  const cx = sx / tiles.length;
  const cy = sy / tiles.length;
  let best = tiles[0];
  let bestD = Infinity;
  for (const t of tiles) {
    const d = (mg.x(t) - cx) ** 2 + (mg.y(t) - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
