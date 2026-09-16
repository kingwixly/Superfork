import { CivilianAircraft, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AircraftExecution } from "./AircraftExecution";

/** Types a fighter will shoot at rather than capture. */
const COMBAT_TARGETS = [UnitType.FighterJet, UnitType.Interceptor];

/** Everything a fighter looks for, in one list so it needs one query. */
const HUNTED: UnitType[] = [...CivilianAircraft.types, ...COMBAT_TARGETS];

/** Radius of the patrol circuit, in tiles. */
const PATROL_RADIUS = 12;

/**
 * Fighter jet.
 *
 * Two distinct behaviours against two classes of target:
 *
 *  - **Combat aircraft** (other fighters, interceptors) are shot down.
 *    Interceptors die easily here by design — that fragility is the balance
 *    lever for the whole air-defence layer, since an interceptor is the only
 *    thing that can kill a MIRV before separation.
 *  - **Civilian aircraft** (cargo jets, airliners) are *captured*, not
 *    destroyed — they flip to the fighter's owner, mirroring how warships take
 *    trade ships. Destroying them would make fighters purely denial units;
 *    capturing makes enemy air traffic worth hunting.
 */
export class FighterJetExecution extends AircraftExecution {
  private patrolTile: TileRef;
  private patrolLeg = 0;

  constructor(unit: Unit, home: Unit | undefined, patrolTile: TileRef) {
    super(unit, home);
    this.patrolTile = patrolTile;
  }

  protected onOrdered(tile: TileRef): void {
    // Move the circuit, not just the heading - otherwise the aircraft flies
    // to the ordered tile and then drifts back to its original patrol.
    this.patrolTile = tile;
    this.patrolLeg = 0;
    this.destination = tile;
  }

  protected decide(ticks: number): void {
    const range = this.mg.config().unitInfo(UnitType.FighterJet).range ?? 60;

    // Out of the base's reach: disengage and go home. Checked before target
    // selection so a fighter cannot be baited beyond its radius.
    if (!this.inRangeOfHome()) {
      this.returnToBase();
      return;
    }

    // Nothing else airborne: skip the spatial query. Fighters patrol
    // constantly, so this ran every tick per fighter regardless.
    let anyAirborne = false;
    for (const t of HUNTED) {
      if (this.mg.unitCount(t) > 0) {
        anyAirborne = true;
        break;
      }
    }
    if (!anyAirborne) {
      this.destination ??= this.patrolTile;
      return;
    }

    // ONE query covering both target classes, split in memory. Previously two
    // separate radius lookups ran every tick per fighter.
    const seen = this.hostileAircraftNear(range, HUNTED);

    // Civilians first. A capture is worth more than a kill, and contesting
    // fighters will usually still be there next tick.
    const civilian = seen.find((u) =>
      CivilianAircraft.types.includes(u.type() as never),
    );
    if (civilian !== undefined) {
      if (this.tryCapture(civilian)) return;
      this.destination = civilian.tile();
      return;
    }

    const combatant = seen.find((u) => COMBAT_TARGETS.includes(u.type()));
    if (combatant !== undefined) {
      if (this.tryEngage(combatant)) return;
      this.destination = combatant.tile();
      return;
    }

    this.destination ??= this.patrolTile;
  }

  /** Capture a civilian aircraft once close enough to escort it down. */
  private tryCapture(target: Unit): boolean {
    const tile = target.tile();
    if (tile === undefined || this.distanceTo(tile) > 1) return false;
    target.setOwner(this.owner());
    return true;
  }

  /** Shoot at a combat aircraft once within weapons range. */
  private tryEngage(target: Unit): boolean {
    const tile = target.tile();
    if (tile === undefined || this.distanceTo(tile) > 2) return false;
    const damage = this.mg.config().unitInfo(UnitType.AAMissile).damage ?? 300;
    const remaining = target.health() - damage;
    if (remaining <= 0) {
      target.delete(true, this.owner());
    } else {
      target.modifyHealth(-damage, this.owner());
    }
    return true;
  }

  protected onArrived(): void {
    // Actually PATROL rather than hover. Clearing the destination made
    // fighters stop dead over the patrol point and sit there, which is what
    // testers saw - a circuit around it reads as an aircraft doing a job, and
    // sweeps a wider area for targets.
    this.patrolLeg = (this.patrolLeg + 1) % 4;
    this.destination = this.patrolPointFor(this.patrolLeg);
  }

  /** A corner of a square circuit centred on the patrol tile. */
  private patrolPointFor(leg: number): TileRef {
    const map = this.mg.map();
    const w = map.width();
    const cx = this.patrolTile % w;
    const cy = (this.patrolTile / w) | 0;
    const r = PATROL_RADIUS;
    const offsets = [
      [r, 0],
      [0, r],
      [-r, 0],
      [0, -r],
    ];
    const [dx, dy] = offsets[leg];
    const x = Math.min(map.width() - 1, Math.max(0, cx + dx));
    const y = Math.min(map.height() - 1, Math.max(0, cy + dy));
    return map.ref(x, y);
  }
}
