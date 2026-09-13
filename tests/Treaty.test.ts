import {
  clearTreaties,
  pendingInviteFor,
  treatiesOf,
  TREATY_MAX_SIZE,
  TreatyCreateExecution,
  TreatyInviteExecution,
  TreatyLeaveExecution,
  TreatyResponseExecution,
} from "../src/core/execution/TreatyExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let p: Player[];

function create(founder: Player, members: Player[]) {
  const e = new TreatyCreateExecution(
    founder,
    members.map((m) => m.id()),
  );
  e.init(game, game.ticks());
  return treatiesOf(founder)[0];
}

describe("Treaties", () => {
  beforeEach(async () => {
    clearTreaties();
    game = await setup(
      "half_land_half_ocean",
      {},
      ["a", "b", "c", "d", "e", "f"].map(
        (n) => new PlayerInfo(n, PlayerType.Human, null, `${n}_id`),
      ),
    );
    p = ["a", "b", "c", "d", "e", "f"].map((n) => game.player(`${n}_id`));
    // Everyone needs territory to count as alive.
    const land: number[] = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    p.forEach((pl, i) => {
      for (const t of land.slice(i * 5, i * 5 + 5)) pl.conquer(t);
    });
  });

  test("creating a treaty allies the founding members", () => {
    const t = create(p[0], [p[1], p[2]]);
    expect(t.getMembers().length).toBe(3);
    // Membership materialises pairwise alliances, so everything that already
    // consumes alliances keeps working.
    expect(p[0].isFriendly(p[1])).toBe(true);
    expect(p[1].isFriendly(p[2])).toBe(true);
  });

  test("creation is capped at three", () => {
    const t = create(p[0], [p[1], p[2], p[3], p[4]]);
    expect(t.getMembers().length).toBe(3);
  });

  test("joining is consensual — an invite alone does nothing", () => {
    const t = create(p[0], [p[1], p[2]]);
    const inv = new TreatyInviteExecution(p[0], t.id, p[3].id());
    inv.init(game, 0);

    expect(pendingInviteFor(t.id, p[3])).toBe(true);
    expect(t.has(p[3])).toBe(false);
  });

  test("accepting an invite joins and allies to everyone inside", () => {
    const t = create(p[0], [p[1], p[2]]);
    new TreatyInviteExecution(p[0], t.id, p[3].id()).init(game, 0);
    new TreatyResponseExecution(p[3], t.id, true).init(game, 0);

    expect(t.has(p[3])).toBe(true);
    expect(p[3].isFriendly(p[1])).toBe(true);
    expect(p[3].isFriendly(p[2])).toBe(true);
  });

  test("declining leaves the treaty untouched", () => {
    const t = create(p[0], [p[1], p[2]]);
    new TreatyInviteExecution(p[0], t.id, p[3].id()).init(game, 0);
    new TreatyResponseExecution(p[3], t.id, false).init(game, 0);
    expect(t.has(p[3])).toBe(false);
  });

  test("only members may invite", () => {
    const t = create(p[0], [p[1], p[2]]);
    new TreatyInviteExecution(p[5], t.id, p[3].id()).init(game, 0);
    expect(pendingInviteFor(t.id, p[3])).toBe(false);
  });

  test("the ceiling is five", () => {
    const t = create(p[0], [p[1], p[2]]);
    for (const joiner of [p[3], p[4], p[5]]) {
      new TreatyInviteExecution(p[0], t.id, joiner.id()).init(game, 0);
      new TreatyResponseExecution(joiner, t.id, true).init(game, 0);
    }
    expect(t.getMembers().length).toBe(TREATY_MAX_SIZE);
    expect(t.has(p[5])).toBe(false);
  });

  test("leaving breaks only the leaver's alliances", () => {
    const t = create(p[0], [p[1], p[2]]);
    new TreatyLeaveExecution(p[0], t.id).init(game, 0);

    expect(t.has(p[0])).toBe(false);
    expect(p[0].isFriendly(p[1])).toBe(false);
    // The bloc survives without them.
    expect(p[1].isFriendly(p[2])).toBe(true);
  });

  test("leaving is not treachery", () => {
    const t = create(p[0], [p[1], p[2]]);
    new TreatyLeaveExecution(p[0], t.id).init(game, 0);
    expect(p[0].isTraitor()).toBe(false);
  });

  test("a treaty that empties out is dissolved", () => {
    const t = create(p[0], [p[1]]);
    new TreatyLeaveExecution(p[0], t.id).init(game, 0);
    new TreatyLeaveExecution(p[1], t.id).init(game, 0);
    expect(treatiesOf(p[1]).length).toBe(0);
  });
});
