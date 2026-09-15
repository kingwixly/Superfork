import {
  BANK_ACCRUAL_DENOMINATOR,
  BANK_ACCRUAL_NUMERATOR,
  BANK_RESERVE_CAP,
} from "../src/core/configuration/SuperforkUnits";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let player: Player;
let other: Player;

describe("Bank", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("player", PlayerType.Human, null, "player_id"),
      new PlayerInfo("other", PlayerType.Human, null, "other_id"),
    ]);
    player = game.player("player_id");
    other = game.player("other_id");
    game.config().structureMinDist = () => 1;
  });

  test("a fresh bank starts empty", () => {
    player.conquer(game.ref(7, 10));
    const bank = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    expect(bank.bankReserve()).toBe(0n);
  });

  test("accrues 900k per 1M of owner income, per bank", () => {
    player.conquer(game.ref(7, 10));
    player.conquer(game.ref(7, 12));
    const a = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    const b = player.buildUnit(UnitType.Bank, game.ref(7, 12), {});

    // Pin income so the assertion does not depend on population tuning.
    const income = 1_000_000n;
    game.config().goldAdditionRate = () => income;

    const exec = new PlayerExecution(player);
    exec.init(game, 0);
    exec.tick(1);

    const expected =
      (income * BANK_ACCRUAL_NUMERATOR) / BANK_ACCRUAL_DENOMINATOR;
    expect(expected).toBe(900_000n);
    // Each bank accrues the full share independently — they do not split it.
    expect(a.bankReserve()).toBe(expected);
    expect(b.bankReserve()).toBe(expected);
  });

  test("accrual is minted alongside income, not skimmed from it", () => {
    player.conquer(game.ref(7, 10));
    player.buildUnit(UnitType.Bank, game.ref(7, 10), {});

    const income = 1_000_000n;
    game.config().goldAdditionRate = () => income;
    const before = player.gold();

    const exec = new PlayerExecution(player);
    exec.init(game, 0);
    exec.tick(1);

    // The owner still receives their full income; the bank's reserve is extra.
    expect(player.gold() - before).toBe(income);
  });

  test("reserve is capped", () => {
    player.conquer(game.ref(7, 10));
    const bank = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    bank.addBankReserve(BANK_RESERVE_CAP * 2n);
    expect(bank.bankReserve()).toBe(BANK_RESERVE_CAP);
  });

  test("capture transfers the whole reserve to the captor", () => {
    player.conquer(game.ref(7, 10));
    const bank = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    bank.addBankReserve(5_000_000n);

    const captorBefore = other.gold();
    bank.setOwner(other);

    expect(other.gold() - captorBefore).toBe(5_000_000n);
    expect(bank.owner()).toBe(other);
  });

  test("a captured bank does not pay out a second time", () => {
    player.conquer(game.ref(7, 10));
    const bank = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    bank.addBankReserve(5_000_000n);

    bank.setOwner(other);
    const afterFirst = player.gold();
    // Recaptured immediately, with nothing accrued in between.
    bank.setOwner(player);

    expect(player.gold() - afterFirst).toBe(0n);
    expect(bank.bankReserve()).toBe(0n);
  });

  test("non-bank units hold no reserve", () => {
    player.conquer(game.ref(7, 10));
    const city = player.buildUnit(UnitType.City, game.ref(7, 10), {});
    expect(city.bankReserve()).toBe(0n);
  });
});

describe("Bank withdrawal", () => {
  test("the owner can take their own reserve", async () => {
    const { WithdrawBankExecution } =
      await import("../src/core/execution/BankExecution");
    player.conquer(game.ref(7, 10));
    const bank = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    bank.addBankReserve(3_000_000n);
    const before = player.gold();

    const exec = new WithdrawBankExecution(player, bank.id());
    exec.init(game, 0);

    // Previously only a CAPTOR could ever collect this - the owner watched the
    // number grow and could not touch it.
    expect(player.gold() - before).toBe(3_000_000n);
    expect(bank.bankReserve()).toBe(0n);
  });

  test("withdrawing twice yields nothing the second time", async () => {
    const { WithdrawBankExecution } =
      await import("../src/core/execution/BankExecution");
    player.conquer(game.ref(7, 10));
    const bank = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    bank.addBankReserve(1_000_000n);

    new WithdrawBankExecution(player, bank.id()).init(game, 0);
    const after = player.gold();
    new WithdrawBankExecution(player, bank.id()).init(game, 0);

    expect(player.gold()).toBe(after);
  });

  test("you cannot withdraw from a bank you do not own", async () => {
    const { WithdrawBankExecution } =
      await import("../src/core/execution/BankExecution");
    player.conquer(game.ref(7, 10));
    const bank = player.buildUnit(UnitType.Bank, game.ref(7, 10), {});
    bank.addBankReserve(2_000_000n);
    const before = other.gold();

    new WithdrawBankExecution(other, bank.id()).init(game, 0);

    expect(other.gold()).toBe(before);
    expect(bank.bankReserve()).toBe(2_000_000n);
  });
});
