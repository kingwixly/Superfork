import type { TileRef } from "../../core/game/GameMap";
import type { ProvinceUpdate } from "../../core/game/GameUpdates";

/** Client-side province state, rebuilt from ProvinceUpdates. */
export interface ProvinceInfo {
  id: number;
  name: string;
  ownerID: number;
  administrative: boolean;
  size: number;
  held: number;
  tiles: TileRef[];
}

export class ProvinceStore {
  /** Province id per tile, 0 = none. */
  readonly provinceOf: Uint16Array;
  private readonly byId = new Map<number, ProvinceInfo>();
  /** Bumped whenever borders change, so renderers know to rebuild. */
  version = 0;

  constructor(tileCount: number) {
    this.provinceOf = new Uint16Array(tileCount);
  }

  apply(u: ProvinceUpdate): void {
    const old = this.byId.get(u.id);
    if (u.removed) {
      if (old) for (const t of old.tiles) this.provinceOf[t] = 0;
      this.byId.delete(u.id);
      this.version++;
      return;
    }
    let tiles = old?.tiles ?? [];
    if (u.tiles !== undefined) {
      if (old) {
        for (const t of old.tiles) {
          if (this.provinceOf[t] === u.id) this.provinceOf[t] = 0;
        }
      }
      tiles = u.tiles;
      for (const t of tiles) this.provinceOf[t] = u.id;
      this.version++;
    }
    if (old && old.ownerID !== u.ownerID) this.version++;
    this.byId.set(u.id, {
      id: u.id,
      name: u.name,
      ownerID: u.ownerID,
      administrative: u.administrative,
      size: u.size,
      held: u.held,
      tiles,
    });
    // Contested state changes the border colour.
    if (old && old.held !== u.held) this.version++;
  }

  get(id: number): ProvinceInfo | undefined {
    return this.byId.get(id);
  }

  at(tile: TileRef): ProvinceInfo | undefined {
    const id = this.provinceOf[tile];
    return id === 0 ? undefined : this.byId.get(id);
  }

  all(): ProvinceInfo[] {
    return [...this.byId.values()];
  }
}
