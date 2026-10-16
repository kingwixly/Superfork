import type { GameMap, TileRef } from "@openfront/engine-api/game/GameMap";
import type { ProvinceSnapshot } from "@openfront/engine-api/game/GameUpdates";
import type { Player } from "./Game";

/**
 * Superfork provinces: player-drawn administrative regions layered on top of
 * normal tile ownership. Only exist when the lobby turned provinces on.
 *
 * A province is a FIXED set of tiles. Conquest still happens tile by tile;
 * the province just records who holds how much of it:
 *
 *  - it belongs to the nation that holds it (at first, the one that drew it),
 *  - it is *contested* while anyone else holds some of its tiles,
 *  - it passes to another nation only once that nation holds every tile.
 *
 * Tiles drawn into no province are the nation's "federal" land. The area
 * with the capital always stays federal.
 *
 * The rules that act on provinces (bonuses, capital collapse, breakaways,
 * liberation, tribe integration, province attacks) are in
 * ProvinceRulesExecution and ProvinceExecution; this class only keeps the
 * map of who holds what.
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
    /** The nation that drew it. Liberating someone else's province is a favour. */
    public founder: Player,
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

  /** Tiles of it held by `player`. */
  heldBy(player: Player): number {
    return this.holders.get(player.smallID()) ?? 0;
  }

  contested(): boolean {
    return this.held() < this.size();
  }
}

export class ProvinceManager {
  /** Province id per tile, 0 = federal / none. */
  private readonly provinceOf: Uint16Array;
  private readonly byId = new Map<number, Province>();
  private nextId = 1;
  /** Province ids changed this tick; `true` = membership changed too. */
  private dirty = new Map<number, boolean>();
  private removed = new Set<number>();
  /** Province ids that changed owner since the rules last looked. */
  private captured: Province[] = [];

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

  /** Province id of a tile, 0 = none. Cheap enough for attack loops. */
  idAt(tile: TileRef): number {
    return this.provinceOf[tile];
  }

  get(id: number): Province | undefined {
    return this.byId.get(id);
  }

  all(): Province[] {
    return [...this.byId.values()];
  }

  ownedBy(player: Player): Province[] {
    const out: Province[] = [];
    for (const p of this.byId.values()) if (p.owner === player) out.push(p);
    return out;
  }

  countOwnedBy(player: Player): number {
    let n = 0;
    for (const p of this.byId.values()) if (p.owner === player) n++;
    return n;
  }

  administrativeOf(player: Player): Province | undefined {
    for (const p of this.byId.values()) {
      if (p.owner === player && p.administrative) return p;
    }
    return undefined;
  }

  /** Minimum province size for this player right now. */
  minSize(player: Player): number {
    return Math.max(
      MIN_PROVINCE_TILES,
      Math.floor(player.numTilesOwned() * MIN_PROVINCE_SHARE),
    );
  }

  /** Provinces that changed hands since the last call. */
  drainCaptured(): Province[] {
    const out = this.captured;
    this.captured = [];
    return out;
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
        this.captured.push(p);
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

    const cut = this.rasterize(strokes);
    if (cut.size === 0) return [];
    const regions = this.regions(player.tiles(), cut, isFederal);
    if (regions.list.length < 2) return [];
    this.absorbCut(cut, regions, isFederal);

    const keep = this.federalRegion(regions, capitalTile);
    const min = this.minSize(player);
    const created: Province[] = [];
    for (let i = 0; i < regions.list.length; i++) {
      if (i === keep || regions.list[i].length < min) continue;
      created.push(this.create(player, regions.list[i]));
    }
    return created;
  }

  /**
   * Split `player`'s federal land into about `count` provinces around the
   * given seed tiles (nearest seed by walking distance over the land). Used
   * by AI nations, which can't draw. The capital's area stays federal.
   */
  partition(
    player: Player,
    seeds: TileRef[],
    capitalTile: TileRef | undefined,
  ): Province[] {
    const mine = player.smallID();
    const isFederal = (t: TileRef) =>
      this.map.ownerID(t) === mine && this.provinceOf[t] === 0;
    const label = new Map<TileRef, number>();
    const list: TileRef[][] = [];
    let frontier: TileRef[] = [];
    for (const s of seeds) {
      if (!isFederal(s) || label.has(s)) continue;
      label.set(s, list.length);
      list.push([s]);
      frontier.push(s);
    }
    if (list.length < 2) return [];
    // Multi-source breadth-first growth: every tile joins the seed that
    // reaches it first, which gives compact, contiguous regions.
    while (frontier.length > 0) {
      const next: TileRef[] = [];
      for (const t of frontier) {
        const idx = label.get(t)!;
        this.map.forEachNeighbor(t, (n) => {
          if (label.has(n) || !isFederal(n)) return;
          label.set(n, idx);
          list[idx].push(n);
          next.push(n);
        });
      }
      frontier = next;
    }
    const regions = { list, label };
    const keep = this.federalRegion(regions, capitalTile);
    const min = this.minSize(player);
    const created: Province[] = [];
    for (let i = 0; i < list.length; i++) {
      if (i === keep || list[i].length < min) continue;
      created.push(this.create(player, list[i]));
    }
    return created;
  }

  /**
   * Make a province out of exactly these tiles (tribe integration). Tiles
   * already in another province are left where they are.
   */
  createFrom(owner: Player, tiles: TileRef[], name?: string): Province | null {
    const free = tiles.filter((t) => this.provinceOf[t] === 0);
    if (free.length === 0) return null;
    return this.create(owner, free, name);
  }

  /**
   * Every land tile inside the strokes: the strokes themselves plus each area
   * they close off from the map edge. Owner-blind; used by the UCI country
   * painter.
   */
  enclosedLand(strokes: TileRef[][]): TileRef[] {
    const cut = this.rasterize(strokes);
    if (cut.size === 0) return [];
    const w = this.map.width();
    const h = this.map.height();
    const outside = new Uint8Array(w * h);
    const stack: TileRef[] = [];
    const seed = (t: TileRef) => {
      if (outside[t] === 1 || cut.has(t)) return;
      outside[t] = 1;
      stack.push(t);
    };
    for (let x = 0; x < w; x++) {
      seed(this.map.ref(x, 0));
      seed(this.map.ref(x, h - 1));
    }
    for (let y = 0; y < h; y++) {
      seed(this.map.ref(0, y));
      seed(this.map.ref(w - 1, y));
    }
    while (stack.length > 0) {
      const t = stack.pop()!;
      this.map.forEachNeighbor(t, seed);
    }
    const out: TileRef[] = [];
    for (let t = 0; t < w * h; t++) {
      if (outside[t] === 0 && this.map.isLand(t)) out.push(t);
    }
    return out;
  }

  private rasterize(strokes: TileRef[][]): Set<TileRef> {
    // A 4-connected cut, so a 4-way flood fill cannot slip through a
    // diagonal step.
    const cut = new Set<TileRef>();
    for (const stroke of strokes) {
      for (let i = 0; i < stroke.length; i++) {
        const a = stroke[i];
        const b = stroke[Math.min(i + 1, stroke.length - 1)];
        if (!this.map.isValidRef(a) || !this.map.isValidRef(b)) continue;
        for (const t of this.supercover(a, b)) cut.add(t);
      }
    }
    return cut;
  }

  private regions(
    tiles: Iterable<TileRef>,
    cut: Set<TileRef>,
    allowed: (t: TileRef) => boolean,
  ): { list: TileRef[][]; label: Map<TileRef, number> } {
    const label = new Map<TileRef, number>();
    const list: TileRef[][] = [];
    for (const start of tiles) {
      if (label.has(start) || cut.has(start) || !allowed(start)) continue;
      const region: TileRef[] = [];
      const idx = list.length;
      const stack = [start];
      label.set(start, idx);
      while (stack.length > 0) {
        const t = stack.pop()!;
        region.push(t);
        this.map.forEachNeighbor(t, (n) => {
          if (label.has(n) || cut.has(n) || !allowed(n)) return;
          label.set(n, idx);
          stack.push(n);
        });
      }
      list.push(region);
    }
    return { list, label };
  }

  /** The cut tiles join a neighbouring area, so no stripes stay federal. */
  private absorbCut(
    cut: Set<TileRef>,
    regions: { list: TileRef[][]; label: Map<TileRef, number> },
    allowed: (t: TileRef) => boolean,
  ): void {
    for (let pass = 0; pass < 3; pass++) {
      for (const t of cut) {
        if (regions.label.has(t) || !allowed(t)) continue;
        let joined = -1;
        this.map.forEachNeighbor(t, (n) => {
          if (joined === -1 && regions.label.has(n)) {
            joined = regions.label.get(n)!;
          }
        });
        if (joined !== -1) {
          regions.label.set(t, joined);
          regions.list[joined].push(t);
        }
      }
    }
  }

  /** Which region stays federal: the capital's, else the largest. */
  private federalRegion(
    regions: { list: TileRef[][]; label: Map<TileRef, number> },
    capitalTile: TileRef | undefined,
  ): number {
    if (capitalTile !== undefined && regions.label.has(capitalTile)) {
      return regions.label.get(capitalTile)!;
    }
    let keep = 0;
    for (let i = 1; i < regions.list.length; i++) {
      if (regions.list[i].length > regions.list[keep].length) keep = i;
    }
    return keep;
  }

  private create(owner: Player, tiles: TileRef[], name?: string): Province {
    const id = this.nextId++;
    const p = new Province(
      id,
      owner,
      owner,
      name ?? `Province ${this.countOwnedBy(owner) + 1}`,
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
    for (const t of p.tiles) {
      if (this.provinceOf[t] === p.id) this.provinceOf[t] = 0;
    }
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

  /** Whether `player` owns land touching the province. */
  borders(p: Province, player: Player): boolean {
    const id = player.smallID();
    for (const t of p.tiles) {
      if (this.map.ownerID(t) === id) return true;
      let hit = false;
      this.map.forEachNeighbor(t, (n) => {
        if (this.map.ownerID(n) === id) hit = true;
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
        founderID: 0,
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
        founderID: p.founder.smallID(),
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

/**
 * Where a nation with provinces may keep its capital: in its administrative
 * province if it has marked one, otherwise on federal land (the seat of
 * government by default). Without provinces, anywhere.
 */
export function capitalSiteAllowed(
  provinces: ProvinceManager,
  player: Player,
  tile: TileRef,
): boolean {
  if (provinces.countOwnedBy(player) === 0) return true;
  const here = provinces.provinceAt(tile);
  const admin = provinces.administrativeOf(player);
  if (admin !== undefined) return here === admin;
  return here === undefined || here.owner !== player;
}

/** Undo the wire flattening: `breaks` are the start indexes of strokes 2+. */
export function splitStrokes(points: TileRef[], breaks: number[]): TileRef[][] {
  const out: TileRef[][] = [];
  let start = 0;
  for (const b of [...breaks].sort((x, y) => x - y)) {
    if (b <= start || b > points.length) continue;
    out.push(points.slice(start, b));
    start = b;
  }
  out.push(points.slice(start));
  return out.filter((s) => s.length > 0);
}
