import { AttackExecution } from "../src/core/execution/AttackExecution";
import { NationAllianceBehavior } from "../src/core/execution/nation/NationAllianceBehavior";
import { NationEmojiBehavior } from "../src/core/execution/nation/NationEmojiBehavior";
import {
  UCI_GOLD_FLOOR,
  UciExecution,
} from "../src/core/execution/UciExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { isAttackLocked } from "../src/core/game/Uci";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { UciIntent } from "../src/core/Schemas";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let foe: Player;
let ai: Player;

/** big_plains, 200x200 land: me x<60, ai 60..119, foe x>=120. */
async function setupGame() {
  game = await setup("big_plains", { instantBuild: true }, [
    new PlayerInfo("me", PlayerType.Human, "me_client", "me_id", true),
    new PlayerInfo("foe", PlayerType.Human, "foe_client", "foe_id"),
    new PlayerInfo("ai", PlayerType.Nation, null, "ai_id"),
  ]);
  while (game.inSpawnPhase() || game.isSpawnImmunityActive()) {
    game.executeNextTick();
  }
  // AIs refuse alliance requests made right at the end of spawn.
  while (game.ticks() <= game.config().numSpawnPhaseTurns() + 2) {
    game.executeNextTick();
  }
  me = game.player("me_id");
  foe = game.player("foe_id");
  ai = game.player("ai_id");
  for (let x = 0; x < game.width(); x++) {
    for (let y = 0; y < game.height(); y++) {
      const t = game.ref(x, y);
      if (x < 60) me.conquer(t);
      else if (x < 120) ai.conquer(t);
      else foe.conquer(t);
    }
  }
  for (const p of [me, foe, ai]) p.setTroops(50_000);
}

/** Queue a UCI action and run it: init on one tick, the action on the next. */
function uci(intent: Omit<UciIntent, "type">, by: Player = me) {
  game.addExecution(new UciExecution(by, intent));
  game.executeNextTick();
  return game.executeNextTick();
}

/** Run the nation's real alliance logic once, as its AI loop would. */
function aiAnswersAlliances() {
  const random = new PseudoRandom(7);
  new NationAllianceBehavior(
    random,
    game,
    ai,
    new NationEmojiBehavior(random, game, ai),
  ).handleAllianceRequests();
}

function messages(updates: ReturnType<Game["executeNextTick"]>): string[] {
  return (updates[GameUpdateType.DisplayEvent] ?? []).map((e) => e.message);
}

describe("UCI", () => {
  beforeEach(setupGame);

  test("infinite gold and troops keep the admin topped up", () => {
    uci({ action: "gold", enabled: true });
    uci({ action: "troops", enabled: true });
    game.executeNextTick();
    expect(me.gold()).toBeGreaterThanOrEqual(UCI_GOLD_FLOOR);
    expect(me.troops()).toBeGreaterThanOrEqual(
      Math.floor(game.config().maxTroops(me)),
    );
    me.removeGold(me.gold());
    game.executeNextTick();
    expect(me.gold()).toBeGreaterThanOrEqual(UCI_GOLD_FLOOR);
  });

  test("every action is announced to every player", () => {
    const updates = uci({ action: "gold", enabled: true });
    const event = (updates[GameUpdateType.DisplayEvent] ?? []).find(
      (e) => e.message === "uci.notice_gold_on",
    );
    expect(event).toBeDefined();
    expect(event!.playerID).toBeNull();
  });

  test("a locked country cannot attack, launch or build weapons", () => {
    uci({ action: "lock_attack", targetID: "foe_id", enabled: true });
    expect(isAttackLocked(foe)).toBe(true);
    const attack = new AttackExecution(1000, foe, "ai_id", null);
    game.addExecution(attack);
    game.executeNextTick();
    expect(attack.isActive()).toBe(false);
    expect(foe.canAttack(game.ref(100, 100))).toBe(false);
    foe.addGold(100_000_000n);
    foe.buildUnit(UnitType.MissileSilo, game.ref(150, 100), {});
    expect(foe.canBuild(UnitType.AtomBomb, game.ref(100, 100))).toBe(false);

    uci({ action: "lock_attack", targetID: "foe_id", enabled: false });
    expect(foe.canAttack(game.ref(100, 100))).toBe(true);
  });

  test("cede a whole country, or paint an area to anyone", () => {
    uci({ action: "cede_country", targetID: "foe_id" });
    expect(foe.numTilesOwned()).toBe(0);
    expect(game.owner(game.ref(150, 100))).toBe(me);

    const area = [game.ref(80, 80), game.ref(81, 80), game.ref(82, 80)];
    uci({ action: "cede_area", tiles: area, recipientID: "me_id" });
    for (const t of area) expect(game.owner(t)).toBe(me);
  });

  test("switch swaps land, gold and troops with the target", () => {
    const myTiles = me.numTilesOwned();
    const foeTiles = foe.numTilesOwned();
    me.setTroops(1234);
    foe.setTroops(5678);
    uci({ action: "switch", targetID: "foe_id" });
    expect(me.numTilesOwned()).toBe(foeTiles);
    expect(foe.numTilesOwned()).toBe(myTiles);
    expect(game.owner(game.ref(150, 100))).toBe(me);
    expect(me.troops()).toBeGreaterThanOrEqual(5678);
  });

  test("disappear returns a country's land to the wilderness", () => {
    foe.buildUnit(UnitType.City, game.ref(150, 100), {});
    uci({ action: "disappear", targetID: "foe_id" });
    expect(foe.numTilesOwned()).toBe(0);
    expect(foe.units(UnitType.City).length).toBe(0);
    expect(game.owner(game.ref(150, 100)).isPlayer()).toBe(false);
  });

  test("make AI attack turns the AI on the target at once", () => {
    uci({ action: "ai_attack", targetID: "foe_id" });
    game.executeNextTick();
    expect(ai.outgoingAttacks().some((a) => a.target() === foe)).toBe(true);
  });

  test("all AI say no: alliance requests from humans are refused", () => {
    uci({ action: "ai_answers", aiAnswer: "no" });
    // Friendly enough that the AI would normally say yes.
    ai.updateRelation(me, 100);
    me.createAllianceRequest(ai);
    aiAnswersAlliances();
    expect(me.allianceWith(ai)).toBeNull();
  });

  test("all AI say yes: alliance requests from humans are accepted", () => {
    uci({ action: "ai_answers", aiAnswer: "yes" });
    // Hostile enough that the AI would normally say no.
    ai.updateRelation(me, -100);
    me.createAllianceRequest(ai);
    aiAnswersAlliances();
    expect(me.allianceWith(ai)).not.toBeNull();
  });

  test("an announcement reaches everyone", () => {
    const updates = uci({ action: "announce", text: "Hello all" });
    const e = (updates[GameUpdateType.DisplayEvent] ?? []).find(
      (x) => x.message === "uci.announcement",
    );
    expect(e?.params?.text).toBe("Hello all");
    expect(e?.playerID).toBeNull();
  });

  test("end game declares the game over", () => {
    const updates = uci({ action: "end_game" });
    expect(game.getWinner()).toBeNull();
    expect((updates[GameUpdateType.Win] ?? []).length).toBe(1);
    expect(messages(updates)).toContain("uci.notice_end_game");
  });

  test("transfer host moves the lobby-creator flag", () => {
    expect(me.isLobbyCreator()).toBe(true);
    uci({ action: "transfer_host", targetClientID: "foe_client" });
    expect(me.isLobbyCreator()).toBe(false);
    expect(foe.isLobbyCreator()).toBe(true);
  });
});
