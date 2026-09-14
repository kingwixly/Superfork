import { CedeLandExecution } from "../src/core/execution/CedeLandExecution";
import { SanctionExecution } from "../src/core/execution/SanctionExecution";
import {
  clearTreaties,
  treatiesOf,
  TreatyCreateExecution,
} from "../src/core/execution/TreatyExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let tribe: Player;
let human: Player;
let land: number[];

describe("Tribes are excluded from superfork systems", () => {
  beforeEach(async () => {
    clearTreaties();
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      // PlayerType.Bot is exactly the tribe set (see TribeSpawner).
      new PlayerInfo("tribe", PlayerType.Bot, null, "tr_id"),
      new PlayerInfo("human", PlayerType.Human, null, "hu_id"),
    ]);
    tribe = game.player("tr_id");
    human = game.player("hu_id");
    tribe.addGold(100_000_000n);
    human.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;

    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    const half = Math.floor(land.length / 2);
    for (const t of land.slice(0, half)) tribe.conquer(t);
    for (const t of land.slice(half)) human.conquer(t);
  });

  test("a tribe cannot build superfork structures", () => {
    for (const t of [
      UnitType.Bank,
      UnitType.Airstrip,
      UnitType.Airfield,
      UnitType.InternationalAirport,
    ]) {
      expect(tribe.canBuild(t, land[0])).toBe(false);
    }
  });

  test("a tribe cannot build superfork ships", () => {
    for (const t of [UnitType.Destroyer, UnitType.Corvette, UnitType.Carrier]) {
      expect(tribe.canBuild(t, land[0])).toBe(false);
    }
  });

  test("a human still can", () => {
    expect(human.canBuild(UnitType.Bank, land[land.length - 1])).not.toBe(
      false,
    );
  });

  test("vanilla units are unaffected for tribes", () => {
    // The exclusion is scoped to superfork types only - a tribe is still a
    // normal, if weak, participant in the base game.
    expect(tribe.canBuild(UnitType.City, land[0])).not.toBe(false);
  });

  test("a tribe cannot sanction", () => {
    new SanctionExecution(tribe, human.id(), "start").init(game, 0);
    expect(tribe.getSanctions().length).toBe(0);
  });

  test("a tribe cannot cede land", () => {
    new CedeLandExecution(tribe, human.id(), land.slice(0, 4)).init(game, 0);
    expect(human.numTilesOwned()).toBe(
      land.length - Math.floor(land.length / 2),
    );
  });

  test("a tribe cannot found a treaty", () => {
    new TreatyCreateExecution(tribe, [human.id()]).init(game, 0);
    expect(treatiesOf(tribe).length).toBe(0);
  });
});
