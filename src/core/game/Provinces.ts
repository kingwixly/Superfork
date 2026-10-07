import { Player } from "./Game";
import { GameMap, TileRef } from "./GameMap";

/**
 * Superfork provinces: player-drawn administrative regions layered on top of
 * normal tile ownership.
 *
 * A province is a FIXED set of tiles. Conquest still happens tile by tile;
 * the province just records who holds how much of it:
 *
 *  - it belongs to the nation that drew it,
 *  - it is *contested* while anyone else holds some of its tiles,
 *  - it passes to another nation only once that nation holds every tile.
 *
 * Tiles drawn into no province are the nation's "federal" land.
 */

/** Smallest province anyone may draw, in tiles. */
export const MIN_PROVINCE_TILES = 400;
/**
 * A province must also be at least this share of the drawer's territory,
 * so provinces come out medium-to-large and the per-province bonuses can't
 * be farmed by cutting land into slivers.
 */
export const MIN_PROVINCE_SHARE = 1 / 10;
/** Longest province name. */
export const MAX_PROVINCE_NAME = 32;

export class Province {
  name: string;
  administrative = false;
  /** Tiles held by each owner smallID (0 = unowned). */
  readonly holders = new Map<number, number>();
  tiles: TileRef[] = [];

  constructor(
    readonly id: number,
    public owner: Player,
    name: string,
  ) {
    this.name = name;
  }

  size(): number {
    return this.tiles.length;
  }

  /** Tiles of this province currently held by its owner. */
  held(): number {
    return this.holders.get(this.owner.smallID()) ?? 0;
  }

  contested(): boolean {
    return this.held() < this.size();
  }
}

/** Snapshot sent to clients whenever a province changes. */
export interface ProvinceSnapshot {
  id: number;
  name: string;
  ownerID: number;
  administrative: boolean;
  size: number;
  held: number;
  /** Present only when membership changed (draw, merge, trim, disband). */
  tiles?: TileRef[];
  removed?: boolean;
}

export class ProvinceManager {
  /** Province id per tile, 0 = federal / none. */
  private readonly provinceOf: Uint16Array;
  private readonly byId = new Map<number, Province>();
  private nextId = 1;
  /** Province ids changed this tick; `true` = membership changed too. */
  private dirty = new Map<number, boolean>();
  private removed = new Set<number>();

  constructor(
    private readonly map: GameMap,
    private readonly playerBySmallID: (id: number) => Player | null,
  ) {
    this.provinceOf = new Uint16Array(map.width() * map.height());
  }

  provinceAt(tile: TileRef): Province | undefined {
    const id = this.provinceOf[tile];
    return id === 0 ? undefined : this.byId.get(id);
  }

  get(id: number): Province | undefined {
    return this.byId.get(id);
  }

  all(): Province[] {
    return [...this.byId.values()];
  }

  ownedBy(player: Player): Province[] {
    return this.all().filter((p) => p.owner === player);
  }

  /** Minimum province size for this player right now. */
  minSize(player: Player): number {
    return Math.max(
      MIN_PROVINCE_TILES,
      Math.floor(player.numTilesOwned() * MIN_PROVINCE_SHARE),
    );
  }

  // ------------------------------------------------------------- ownership --

  /** Called by GameImpl on every tile owner change. */
  onOwnerChange(tile: TileRef, from: number, to: number): void {
    const id = this.provinceOf[tile];
    if (id === 0) return;
    const p = this.byId.get(id);
    if (p === undefined) return;
    p.holders.set(from, (p.holders.get(from) ?? 1) - 1);
    p.holders.set(to, (p.holders.get(to) ?? 0) + 1);
    const ownerBefore = p.owner;
    // Whole province held by someone else: it is theirs now.
    if (
      to !== 0 &&
      to !== p.owner.smallID() &&
      p.holders.get(to) === p.size()
    ) {
      const next = this.playerBySmallID(to);
      if (next !== null) {
        p.owner = next;
        p.administrative = false;
      }
    }
    // Only the contested flag and the owner matter to clients; flag the
    // province when either can have changed.
    if (
      ownerBefore !== p.owner ||
      from === p.owner.smallID() ||
      to === p.owner.smallID()
    ) {
      this.markDirty(id, false);
    }
  }

  // ------------------------------------------------------------- drawing --

  /**
   * Cut `player`'s federal land along the drawn strokes. Every enclosed
   * area big enough becomes a province; the area holding the capital (or the
   * largest one, with no capital) stays federal, as do areas under the
   * minimum. Returns the new provinces.
   */
  draw(
    player: Player,
    strokes: TileRef[][],
    capitalTile: TileRef | undefined,
  ): Province[] {
    const mine = player.smallID();
    const isFederal = (t: TileRef) =>
      this.map.ownerID(t) === mine && this.provinceOf[t] === 0;

    // 1. Rasterize the strokes into a 4-connected cut, so a 4-way flood fill
    //    cannot slip through a diagonal step.
    const cut = new Set<TileRef>();
    for (const stroke of strokes) {
      for (let i = 0; i < stroke.length; i++) {
        const a = stroke[i];
        const b = stroke[Math.min(i + 1, stroke.length - 1)];
        if (!this.map.isValidRef(a) || !this.map.isValidRef(b)) continue;
        for (const t of this.supercover(a, b)) cut.add(t);
      }
    }
    if (cut.size === 0) return [];

    // 2. Flood the federal land, treating the cut as walls.
    const label = new Map<TileRef, number>();
    const regions: TileRef[][] = [];
    const nb: TileRef[] = [];
    for (const start of player.tiles()) {
      if (label.has(start) || cut.has(start) || !isFederal(start)) continue;
      const region: TileRef[] = [];
      const idx = regions.length;
      const stack = [start];
      label.set(start, idx);
      while (stack.length > 0) {
        const t = stack.pop()!;
        region.push(t);
        nb.length = 0;
        this.map.forEachNeighbor(t, (n) => nb.push(n));
        for (const n of nb) {
          if (label.has(n) || cut.has(n) || !isFederal(n)) continue;
          label.set(n, idx);
          stack.push(n);
        }
      }
      regions.push(region);
    }
    if (regions.length < 2) return [];

    // 3. The cut tiles themselves join a neighbouring area, so drawing never
    //    leaves stripes of federal land behind.
    for (let pass = 0; pass < 3; pass++) {
      for (const t of cut) {
        if (label.has(t) || !isFederal(t)) continue;
        let joined = -1;
        this.map.forEachNeighbor(t, (n) => {
          if (joined === -1 && label.has(n)) joined = label.get(n)!;
        });
        if (joined !== -1) {
          label.set(t, joined);
          regions[joined].push(t);
        }
      }
    }

    // 4. Which area stays federal.
    let keep = 0;
    if (capitalTile !== undefined && label.has(capitalTile)) {
      keep = label.get(capitalTile)!;
    } else {
      for (let i = 1; i < regions.length; i++) {
        if (regions[i].length > regions[keep].length) keep = i;
      }
    }

    const min = this.minSize(player);
    const created: Province[] = [];
    for (let i = 0; i < regions.length; i++) {
      if (i === keep || regions[i].length < min) continue;
      created.push(this.create(player, regions[i]));
    }
    return created;
  }

  private create(owner: Player, tiles: TileRef[]): Province {
    const id = this.nextId++;
    const p = new Province(
      id,
      owner,
      `Province ${this.ownedBy(owner).length + 1}`,
    );
    this.byId.set(id, p);
    this.assign(p, tiles);
    this.markDirty(id, true);
    return p;
  }

  private assign(p: Province, tiles: TileRef[]): void {
    for (const t of tiles) {
      this.provinceOf[t] = p.id;
      const holder = this.map.ownerID(t);
      p.holders.set(holder, (p.holders.get(holder) ?? 0) + 1);
    }
    p.tiles.push(...tiles);
  }

  /** 4-connected line between two tiles (every tile the segment touches). */
  private supercover(a: TileRef, b: TileRef): TileRef[] {
    let x = this.map.x(a);
    let y = this.map.y(a);
    const x1 = this.map.x(b);
    const y1 = this.map.y(b);
    const dx = Math.abs(x1 - x);
    const dy = Math.abs(y1 - y);
    const sx = x < x1 ? 1 : -1;
    const sy = y < y1 ? 1 : -1;
    const out: TileRef[] = [this.map.ref(x, y)];
    let err = dx - dy;
    while (x !== x1 || y !== y1) {
      const e2 = err * 2;
      const stepX = e2 > -dy;
      const stepY = e2 < dx;
      if (stepX) {
        err -= dy;
        x += sx;
      }
      if (stepX && stepY) {
        // A diagonal step would leave a gap a 4-way flood fill slips
        // through; fill the corner first.
        out.push(this.map.ref(x, y));
      }
      if (stepY) {
        err += dx;
        y += sy;
      }
      out.push(this.map.ref(x, y));
    }
    return out;
  }

  // ------------------------------------------------------------- editing --

  rename(p: Province, name: string): void {
    p.name = name;
    this.markDirty(p.id, false);
  }

  setAdministrative(p: Province): void {
    for (const other of this.ownedBy(p.owner)) {
      if (other.administrative && other !== p) {
        other.administrative = false;
        this.markDirty(other.id, false);
      }
    }
    p.administrative = true;
    this.markDirty(p.id, false);
  }

  /** Return a province's land to federal territory. */
  disband(p: Province): void {
    for (const t of p.tiles) this.provinceOf[t] = 0;
    this.byId.delete(p.id);
    this.dirty.delete(p.id);
    this.removed.add(p.id);
  }

  /** Whether two provinces share a border. */
  adjacent(a: Province, b: Province): boolean {
    const [small, big] = a.size() <= b.size() ? [a, b] : [b, a];
    for (const t of small.tiles) {
      let hit = false;
      this.map.forEachNeighbor(t, (n) => {
        if (this.provinceOf[n] === big.id) hit = true;
      });
      if (hit) return true;
    }
    return false;
  }

  /** Fold `b` into `a`. */
  merge(a: Province, b: Province): void {
    const tiles = b.tiles;
    this.disband(b);
    this.assign(a, tiles);
    this.markDirty(a.id, true);
  }

  /**
   * Drop every tile the owner no longer holds, so the border follows the
   * owner's land again. Removes the province if nothing is left.
   */
  trim(p: Province): void {
    const mine = p.owner.smallID();
    const keep: TileRef[] = [];
    for (const t of p.tiles) {
      if (this.map.ownerID(t) === mine) keep.push(t);
      else this.provinceOf[t] = 0;
    }
    if (keep.length === 0) {
      this.disband(p);
      return;
    }
    p.tiles = keep;
    p.holders.clear();
    p.holders.set(mine, keep.length);
    this.markDirty(p.id, true);
  }

  // ------------------------------------------------------------- updates --

  private markDirty(id: number, membership: boolean): void {
    this.dirty.set(id, (this.dirty.get(id) ?? false) || membership);
  }

  /** Changes since the last call, for GameUpdates. */
  drain(): ProvinceSnapshot[] {
    const out: ProvinceSnapshot[] = [];
    for (const id of this.removed) {
      out.push({
        id,
        name: "",
        ownerID: 0,
        administrative: false,
        size: 0,
        held: 0,
        removed: true,
      });
    }
    for (const [id, membership] of this.dirty) {
      const p = this.byId.get(id);
      if (p === undefined) continue;
      out.push({
        id,
        name: p.name,
        ownerID: p.owner.smallID(),
        administrative: p.administrative,
        size: p.size(),
        held: p.held(),
        ...(membership ? { tiles: [...p.tiles] } : {}),
      });
    }
    this.dirty = new Map();
    this.removed = new Set();
    return out;
  }
}
