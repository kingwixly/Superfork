import { PlayerID } from "./Game";
import { TileRef } from "./GameMap";

/**
 * Conquest ledger (superfork).
 *
 * Liberation needs to restore a victim's territory to the state it was in
 * before an aggressor took it. That requires knowing which specific tiles
 * changed hands between which pair of nations.
 *
 * ## Why not a snapshot
 *
 * The obvious implementation — snapshot the whole map when a war starts — is
 * O(map) per conflict, and several simultaneous wars on a 1000x1000 map would
 * be hundreds of megabytes. Instead this journals only tiles that *actually
 * changed hands*, which is a tiny fraction of any map and is the only data
 * liberation ever reads.
 *
 * ## Why it stays bounded
 *
 * Each tile appears in at most one bucket at a time. When a tile changes hands
 * again it is removed from its previous bucket before being added to the new
 * one, so total entries never exceed the number of owned tiles on the map —
 * and in practice sits far below it, since most tiles never transfer at all.
 *
 * Neutral land is not recorded: taking unclaimed ground is expansion, not
 * conquest, and there is no prior owner to restore it to.
 */
export class ConquestLedger {
  /** `${from}|${to}` -> the tiles `to` currently holds that it took from `from`. */
  private buckets = new Map<string, Set<TileRef>>();
  /** Reverse index so a tile can be evicted from its old bucket in O(1). */
  private tileBucket = new Map<TileRef, string>();

  private static key(from: PlayerID, to: PlayerID): string {
    return `${from}|${to}`;
  }

  /**
   * Record that `to` took `tile` from `from`.
   *
   * Call on every ownership change between two players. Passing the same
   * player for both is a no-op.
   */
  record(tile: TileRef, from: PlayerID, to: PlayerID): void {
    this.forget(tile);
    if (from === to) return;

    const k = ConquestLedger.key(from, to);
    let bucket = this.buckets.get(k);
    if (bucket === undefined) {
      bucket = new Set();
      this.buckets.set(k, bucket);
    }
    bucket.add(tile);
    this.tileBucket.set(tile, k);
  }

  /** Drop a tile from whichever bucket holds it. */
  forget(tile: TileRef): void {
    const prev = this.tileBucket.get(tile);
    if (prev === undefined) return;
    const bucket = this.buckets.get(prev);
    bucket?.delete(tile);
    if (bucket !== undefined && bucket.size === 0) this.buckets.delete(prev);
    this.tileBucket.delete(tile);
  }

  /**
   * Tiles `aggressor` currently holds that it took from `victim`.
   *
   * This is exactly the set liberation restores. Tiles the aggressor has
   * since lost to someone else are already gone from the bucket, so a
   * liberation never hands back ground the aggressor no longer controls.
   */
  takenFrom(victim: PlayerID, aggressor: PlayerID): TileRef[] {
    const bucket = this.buckets.get(ConquestLedger.key(victim, aggressor));
    return bucket === undefined ? [] : [...bucket];
  }

  /** Total journalled tiles. Exposed so the bound can be asserted in tests. */
  size(): number {
    return this.tileBucket.size;
  }

  clear(): void {
    this.buckets.clear();
    this.tileBucket.clear();
  }
}
