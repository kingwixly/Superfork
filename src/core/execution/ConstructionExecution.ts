import { Execution, Game, Player, Tick, Unit, UnitType } from "../game/Game";
import { TileRef } from "../game/GameMap";
import { AirBaseExecution } from "./AirBaseExecution";
import { ASBMExecution } from "./ASBMExecution";
import { BankExecution } from "./BankExecution";
import { CityExecution } from "./CityExecution";
import { CorvetteExecution } from "./CorvetteExecution";
import { DefensePostExecution } from "./DefensePostExecution";
import { FactoryExecution } from "./FactoryExecution";
import { FighterJetExecution } from "./FighterJetExecution";
import { InterceptorExecution } from "./InterceptorExecution";
import { MirvExecution } from "./MIRVExecution";
import { MissileSiloExecution } from "./MissileSiloExecution";
import { NukeExecution } from "./NukeExecution";
import { PortExecution } from "./PortExecution";
import { SAMLauncherExecution } from "./SAMLauncherExecution";
import { SpecialWarheadExecution } from "./SpecialWarheadExecution";
import { TransportJetExecution } from "./TransportJetExecution";
import { WarshipExecution } from "./WarshipExecution";

export class ConstructionExecution implements Execution {
  private structure: Unit | null = null;
  private active: boolean = true;
  private mg: Game;

  private ticksUntilComplete: Tick;

  constructor(
    private player: Player,
    private constructionType: UnitType,
    private tile: TileRef,
    private rocketDirectionUp?: boolean,
    private amount?: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;

    if (this.mg.config().isUnitDisabled(this.constructionType)) {
      console.warn(
        `cannot build construction ${this.constructionType} because it is disabled`,
      );
      this.active = false;
      return;
    }

    if (!this.mg.isValidRef(this.tile)) {
      console.warn(`cannot build construction invalid tile ${this.tile}`);
      this.active = false;
      return;
    }
  }

  tick(ticks: number): void {
    if (this.structure === null) {
      const info = this.mg.unitInfo(this.constructionType);
      // For non-structure units (nukes/warship), charge once and delegate to specialized executions.
      const isStructure = this.isStructure(this.constructionType);
      if (!isStructure) {
        // Defer validation and gold deduction to the specific execution
        this.completeConstruction();
        this.active = false;
        return;
      }

      // Structures: build real unit and mark under construction
      const spawnTile = this.player.canBuild(this.constructionType, this.tile);
      if (spawnTile === false) {
        console.warn(`cannot build ${this.constructionType}`);
        this.active = false;
        return;
      }
      this.structure = this.player.buildUnit(
        this.constructionType,
        spawnTile,
        {},
      );
      const duration = info.constructionDuration ?? 0;
      if (duration > 0) {
        this.structure.setUnderConstruction(true);
        this.ticksUntilComplete = duration;
        return;
      }
      // No construction time
      this.completeConstruction();
      this.active = false;
      return;
    }

    if (!this.structure.isActive()) {
      this.active = false;
      return;
    }

    if (this.player !== this.structure.owner()) {
      this.player = this.structure.owner();
    }

    if (this.ticksUntilComplete === 0) {
      this.player = this.structure.owner();
      this.completeConstruction();
      this.active = false;
      return;
    }
    this.ticksUntilComplete--;
  }

  private completeConstruction() {
    if (this.structure) {
      this.structure.setUnderConstruction(false);
    }
    const player = this.player;
    switch (this.constructionType) {
      case UnitType.AtomBomb:
      case UnitType.HydrogenBomb: {
        const count = this.amount ?? 1;
        for (let i = 0; i < count; i++) {
          // NukeExecution staggers same-tick launches per silo itself.
          this.mg.addExecution(
            new NukeExecution(
              this.constructionType,
              player,
              this.tile,
              null,
              -1,
              0,
              this.rocketDirectionUp,
            ),
          );
        }
        break;
      }
      case UnitType.MIRV:
        this.mg.addExecution(new MirvExecution(player, this.tile));
        break;
      // Superfork warheads. These existed and were tested from Phase 6 but
      // were never wired here or into BuildableAttacks, so nothing could
      // launch them - they were unreachable in play.
      case UnitType.NeutronBomb:
      case UnitType.EMPBomb:
        this.mg.addExecution(
          new SpecialWarheadExecution(player, this.constructionType, this.tile),
        );
        break;
      case UnitType.ASBM: {
        // ASBM picks a NATION, not a tile: whoever owns the tile you aimed at,
        // or - when you aimed at open water, which is where ships are - the
        // owner of the nearest enemy hull.
        const owner = this.mg.owner(this.tile);
        const target = owner.isPlayer()
          ? (owner as Player)
          : player.asbmTargetNear(this.tile);
        if (target !== null && target !== undefined) {
          this.mg.addExecution(new ASBMExecution(player, target.id()));
        }
        break;
      }
      case UnitType.Warship:
      case UnitType.Destroyer:
        // One execution drives both hulls - they share the whole
        // patrol/hunt/retreat state machine and differ only in stats and in
        // whether they carry a nuke-interception radius.
        this.mg.addExecution(
          new WarshipExecution(
            { owner: player, patrolTile: this.tile },
            this.constructionType,
          ),
        );
        break;
      case UnitType.Carrier: {
        // A carrier is an air base that floats, so it gets the same execution
        // as the land bases - AirBaseExecution reads its launch rules and
        // range from the unit type, and aircraft homed to it track its tile
        // as it moves.
        const spawn = player.canBuild(UnitType.Carrier, this.tile);
        if (spawn !== false) {
          const carrier = player.buildUnit(UnitType.Carrier, spawn, {
            patrolTile: this.tile,
          });
          // TWO executions: AirBaseExecution launches its aircraft,
          // WarshipExecution moves the hull. With only the first it sat
          // motionless - a mobile airstrip that never moved, which is what
          // shipped.
          this.mg.addExecution(new AirBaseExecution(carrier));
          this.mg.addExecution(new WarshipExecution(carrier, UnitType.Carrier));
        }
        break;
      }
      case UnitType.FighterJet:
      case UnitType.Interceptor: {
        // canBuild already resolved the spawn to a capable base; the clicked
        // tile becomes the patrol point.
        const spawn = player.canBuild(this.constructionType, this.tile);
        if (spawn !== false) {
          const base = [
            ...player.units(UnitType.Airstrip),
            ...player.units(UnitType.Airfield),
            ...player.units(UnitType.InternationalAirport),
            ...player.units(UnitType.Carrier),
          ].find((b) => b.tile() === spawn);
          const unit = player.buildUnit(this.constructionType, spawn, {
            patrolTile: this.tile,
            homeBase: base,
          });
          this.mg.addExecution(
            this.constructionType === UnitType.Interceptor
              ? new InterceptorExecution(unit, base, this.tile)
              : new FighterJetExecution(unit, base, this.tile),
          );
        }
        break;
      }
      case UnitType.TransportJet: {
        // The air assault: launches from an airfield or airport and lands
        // troops on the clicked tile, twice as fast as a boat.
        const spawn = player.canBuild(UnitType.TransportJet, this.tile);
        if (spawn !== false) {
          const base = [
            ...player.units(UnitType.Airfield),
            ...player.units(UnitType.InternationalAirport),
          ].find((b) => b.tile() === spawn);
          const troops = player.troops() / 4;
          const unit = player.buildUnit(UnitType.TransportJet, spawn, {
            troops,
            targetTile: this.tile,
            homeBase: base,
          });
          this.mg.addExecution(
            new TransportJetExecution(unit, base, this.tile, player),
          );
        }
        break;
      }
      case UnitType.Corvette: {
        const spawn = player.canBuild(UnitType.Corvette, this.tile);
        if (spawn !== false) {
          const corvette = player.buildUnit(UnitType.Corvette, spawn, {
            patrolTile: this.tile,
          });
          // Same pairing as the carrier: CorvetteExecution owns troop
          // loading and deployment, WarshipExecution moves the hull.
          this.mg.addExecution(new CorvetteExecution(corvette));
          this.mg.addExecution(
            new WarshipExecution(corvette, UnitType.Corvette),
          );
        }
        break;
      }
      case UnitType.Port:
        this.mg.addExecution(new PortExecution(this.structure!));
        break;
      case UnitType.MissileSilo:
        this.mg.addExecution(new MissileSiloExecution(this.structure!));
        break;
      case UnitType.DefensePost:
        this.mg.addExecution(new DefensePostExecution(this.structure!));
        break;
      case UnitType.SAMLauncher:
        this.mg.addExecution(
          new SAMLauncherExecution(player, null, this.structure!),
        );
        break;
      case UnitType.City:
        this.mg.addExecution(new CityExecution(this.structure!));
        break;
      case UnitType.Factory:
        this.mg.addExecution(new FactoryExecution(this.structure!));
        break;
      case UnitType.Bank:
        this.mg.addExecution(new BankExecution(this.structure!));
        break;
      case UnitType.Airstrip:
      case UnitType.Airfield:
      case UnitType.InternationalAirport:
        this.mg.addExecution(new AirBaseExecution(this.structure!));
        break;
      default:
        console.warn(
          `unit type ${this.constructionType} cannot be constructed`,
        );
        break;
    }
  }

  private isStructure(type: UnitType): boolean {
    switch (type) {
      case UnitType.Port:
      case UnitType.MissileSilo:
      case UnitType.DefensePost:
      case UnitType.SAMLauncher:
      case UnitType.City:
      case UnitType.Factory:
      case UnitType.Bank:
      case UnitType.Airstrip:
      case UnitType.Airfield:
      case UnitType.InternationalAirport:
        return true;
      default:
        return false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
