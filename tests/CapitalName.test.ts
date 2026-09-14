import {
  capitalDisplayName,
  MAX_CAPITAL_NAME_LENGTH,
  PromoteCapitalExecution,
  RenameCapitalExecution,
} from "../src/core/execution/CapitalExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let land: number[];

function promoteCapital() {
  const city = me.buildUnit(UnitType.City, land[0], {});
  const e = new PromoteCapitalExecution(me, city.id());
  e.init(game, 0);
  e.tick(0);
  return me.units(UnitType.Capital)[0];
}

function rename(unitId: number, name: string) {
  new RenameCapitalExecution(me, unitId, name).init(game, 0);
}

describe("Capital naming", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    ]);
    me = game.player("me_id");
    me.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;
    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    for (const t of land) me.conquer(t);
  });

  test("a new capital starts unnamed", () => {
    promoteCapital();
    expect(capitalDisplayName(me)).toBeNull();
  });

  test("it can be named", () => {
    const cap = promoteCapital();
    rename(cap.id(), "Aurora");
    expect(cap.capitalName()).toBe("Aurora");
    expect(capitalDisplayName(me)).toBe("Aurora");
  });

  test("it can be renamed", () => {
    const cap = promoteCapital();
    rename(cap.id(), "Aurora");
    rename(cap.id(), "Nova");
    expect(capitalDisplayName(me)).toBe("Nova");
  });

  test("an empty name clears it", () => {
    const cap = promoteCapital();
    rename(cap.id(), "Aurora");
    rename(cap.id(), "   ");
    expect(capitalDisplayName(me)).toBeNull();
  });

  test("names are trimmed", () => {
    const cap = promoteCapital();
    rename(cap.id(), "  Aurora  ");
    expect(cap.capitalName()).toBe("Aurora");
  });

  test("over-long names are refused", () => {
    const cap = promoteCapital();
    rename(cap.id(), "x".repeat(MAX_CAPITAL_NAME_LENGTH + 1));
    expect(cap.capitalName()).toBe("");
  });

  test("you cannot rename someone else's capital", () => {
    const cap = promoteCapital();
    // A unit id the player does not own is simply not found.
    new RenameCapitalExecution(me, cap.id() + 999, "Stolen").init(game, 0);
    expect(cap.capitalName()).toBe("");
  });

  test("the name belongs to the building, not the nation", () => {
    // Losing the capital and promoting a new city gives a fresh, unnamed one.
    const cap = promoteCapital();
    rename(cap.id(), "Aurora");
    cap.delete(false);

    const city = me.buildUnit(UnitType.City, land[5], {});
    const e = new PromoteCapitalExecution(me, city.id());
    e.init(game, 0);
    e.tick(0);

    expect(capitalDisplayName(me)).toBeNull();
  });
});
