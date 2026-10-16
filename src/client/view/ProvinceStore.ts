import type { TileRef } from "@openfront/engine-api/game/GameMap";
import type {
  ProvinceUpdate,
  PuppetUpdate,
} from "@openfront/engine-api/game/GameUpdates";

/** Client-side province state, rebuilt from ProvinceUpdates. */
export interface ProvinceInfo {
  id: number;
  name: string;
  ownerID: number;
  founderID: number;
  administrative: boolean;
  size: number;
  held: number;
  tiles: TileRef[];
}

/** Superfork: provinces and puppets as the simulation last reported them. */
export class ProvinceStore {
  /** Province id per tile, 0 = none. */
  readonly provinceOf: Uint16Array;
  private readonly byId = new Map<number, ProvinceInfo>();
  /** Puppet smallID → master smallID. */
  private readonly masters = new Map<number, number>();
  /** Bumped whenever borders change, so renderers know to rebuild. */
  version = 0;

  constructor(tileCount: number) {
    this.provinceOf = new Uint16Array(tileCount);
  }

  apply(u: ProvinceUpdate): void {
    const old = this.byId.get(u.id);
    if (u.removed) {
      if (old) {
        for (const t of old.tiles) {
          if (this.provinceOf[t] === u.id) this.provinceOf[t] = 0;
        }
      }
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
    if (old && (old.ownerID !== u.ownerID || old.held !== u.held)) {
      // Owner and contested state both change the border colour.
      this.version++;
    }
    if (old && old.administrative !== u.administrative) this.version++;
    if (old && old.name !== u.name) this.version++;
    this.byId.set(u.id, {
      id: u.id,
      name: u.name,
      ownerID: u.ownerID,
      founderID: u.founderID,
      administrative: u.administrative,
      size: u.size,
      held: u.held,
      tiles,
    });
  }

  applyPuppet(u: PuppetUpdate): void {
    if (u.masterID === 0) this.masters.delete(u.puppetID);
    else this.masters.set(u.puppetID, u.masterID);
    this.version++;
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

  ownedBy(smallID: number): ProvinceInfo[] {
    return this.all().filter((p) => p.ownerID === smallID);
  }

  /** smallID of a nation's master, 0 when it answers to no one. */
  masterOf(smallID: number): number {
    return this.masters.get(smallID) ?? 0;
  }

  /** smallIDs of a master's puppets. */
  puppetsOf(smallID: number): number[] {
    const out: number[] = [];
    for (const [puppet, master] of this.masters) {
      if (master === smallID) out.push(puppet);
    }
    return out;
  }

  /** Provinces plus puppets, as the engine counts them for bonuses. */
  count(smallID: number): number {
    let n = 0;
    for (const p of this.byId.values()) if (p.ownerID === smallID) n++;
    return n + this.puppetsOf(smallID).length;
  }
}
