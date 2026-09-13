import {
  ASSISTANCE_COMMITMENT,
  AssistanceResponseExecution,
  clearPendingAssistance,
  pendingAssistanceFrom,
  RequestAssistanceExecution,
} from "../src/core/execution/AssistanceExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let ally: Player;
let enemy: Player;
let stranger: Player;

function ask(mode: "attack" | "troops", helper = ally, against = enemy) {
  const e = new RequestAssistanceExecution(me, helper.id(), against.id(), mode);
  e.init(game, 0);
}
function answer(accept: boolean, helper = ally) {
  const e = new AssistanceResponseExecution(helper, me.id(), accept);
  e.init(game, 0);
}

describe("Alliance fighting", () => {
  beforeEach(async () => {
    clearPendingAssistance();
    game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("ally", PlayerType.Human, null, "al_id"),
      new PlayerInfo("enemy", PlayerType.Human, null, "en_id"),
      new PlayerInfo("stranger", PlayerType.Human, null, "st_id"),
    ]);
    me = game.player("me_id");
    ally = game.player("al_id");
    enemy = game.player("en_id");
    stranger = game.player("st_id");

    const land: number[] = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    // Ally and enemy get adjacent blocks so they share a border.
    const n = Math.floor(land.length / 4);
    for (const t of land.slice(0, n)) me.conquer(t);
    for (const t of land.slice(n, n * 2)) ally.conquer(t);
    for (const t of land.slice(n * 2, n * 3)) enemy.conquer(t);
    for (const t of land.slice(n * 3)) stranger.conquer(t);

    const req = me.createAllianceRequest(ally);
    req?.accept();
    ally.setTroops(10_000);
  });

  test("you may only call on an ally", () => {
    ask("troops", stranger);
    expect(pendingAssistanceFrom(me, stranger)).toBeUndefined();
  });

  test("an ally can be asked", () => {
    ask("troops");
    expect(pendingAssistanceFrom(me, ally)?.mode).toBe("troops");
  });

  test("a request alone commits nothing", () => {
    const before = ally.troops();
    ask("troops");
    expect(ally.troops()).toBe(before);
  });

  test("accepting a troop request donates a share of the helper's army", () => {
    ask("troops");
    const helperBefore = ally.troops();
    const mineBefore = me.troops();

    answer(true);

    const expected = Math.floor(helperBefore * ASSISTANCE_COMMITMENT);
    expect(ally.troops()).toBe(helperBefore - expected);
    expect(me.troops()).toBe(mineBefore + expected);
  });

  test("declining commits nothing", () => {
    ask("troops");
    const before = ally.troops();
    answer(false);
    expect(ally.troops()).toBe(before);
    expect(pendingAssistanceFrom(me, ally)).toBeUndefined();
  });

  test("accepting an attack request opens a front", () => {
    expect(ally.sharesBorderWith(enemy)).toBe(true);
    ask("attack");
    answer(true);
    // addExecution queues; the attack registers on the next tick.
    game.executeNextTick();
    expect(ally.outgoingAttacks().length).toBeGreaterThan(0);
  });

  test("an attack request is refused with no shared border", () => {
    // stranger is allied to nobody and not adjacent to me's enemy choice.
    const req = me.createAllianceRequest(stranger);
    req?.accept();
    stranger.setTroops(5000);
    // Ask stranger to attack someone they do not border.
    const e = new RequestAssistanceExecution(
      me,
      stranger.id(),
      ally.id(),
      "attack",
    );
    e.init(game, 0);
    new AssistanceResponseExecution(stranger, me.id(), true).init(game, 0);
    // No front opened, because stranger is allied to ally.
    expect(stranger.outgoingAttacks().length).toBe(0);
  });

  test("a helper will not be made a traitor against their own ally", () => {
    // me asks ally to attack stranger, but ally allies stranger first.
    const req = ally.createAllianceRequest(stranger);
    req?.accept();
    ask("attack", ally, stranger);
    answer(true);
    expect(ally.isTraitor()).toBe(false);
    expect(ally.outgoingAttacks().length).toBe(0);
  });

  test("answering with no outstanding request does nothing", () => {
    const before = ally.troops();
    answer(true);
    expect(ally.troops()).toBe(before);
  });
});
