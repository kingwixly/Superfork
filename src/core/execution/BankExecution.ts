import { Execution, Game, Player, Unit, UnitType } from "../game/Game";
import { TrainStationExecution } from "./TrainStationExecution";

/**
 * Banks have no per-tick behaviour of their own: accrual is driven from
 * PlayerExecution, where the owner's income is already being computed, so
 * that every bank sees exactly the same income figure in the same tick. Doing
 * it here instead would mean each bank re-deriving income independently,
 * which is both wasteful and a determinism risk.
 *
 * What this execution does own is lifecycle — joining the rail network like
 * any other economic structure, and retiring when the bank dies.
 */
/**
 * Withdraw a bank's reserve into the owner's treasury.
 *
 * Banks accrued gold that ONLY a captor could collect - the owner could watch
 * the number grow and never touch it, which made a bank a liability rather
 * than an asset. Withdrawing empties the reserve, so the choice is real:
 * bank it and risk losing the lot, or take it and start again.
 */
export class WithdrawBankExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private unitId: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    const bank = this.player
      .units(UnitType.Bank)
      .find((u) => u.id() === this.unitId);
    if (bank === undefined || !bank.isActive()) return;
    if (bank.isUnderConstruction()) return;

    const held = bank.drainBankReserve();
    if (held <= 0n) return;
    this.player.addGold(held, bank.tile());
  }

  tick(ticks: number): void {}
  isActive(): boolean {
    return this.active;
  }
  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

export class BankExecution implements Execution {
  private mg: Game;
  private active: boolean = true;
  private stationCreated = false;

  constructor(private bank: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.stationCreated) {
      this.createStation();
      this.stationCreated = true;
    }
    if (!this.bank.isActive()) {
      this.active = false;
      return;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  private createStation(): void {
    const nearbyFactory = this.mg.hasUnitNearby(
      this.bank.tile()!,
      this.mg.config().trainStationMaxRange(),
      UnitType.Factory,
    );
    if (nearbyFactory) {
      this.mg.addExecution(new TrainStationExecution(this.bank));
    }
  }
}
