import { UciIntent } from "@openfront/engine-api/Schemas";
import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { AttackExecution } from "@openfront/engine/execution/AttackExecution";
import { PlayerExecution } from "@openfront/engine/execution/PlayerExecution";
import {
  UCI_GOLD_FLOOR,
  UciExecution,
} from "@openfront/engine/execution/UciExecution";
import { NationAllianceBehavior } from "@openfront/engine/execution/nation/NationAllianceBehavior";
import { NationEmojiBehavior } from "@openfront/engine/execution/nation/NationEmojiBehavior";
import { Game, Player } from "@openfront/engine/game/Game";
import { isAttackLocked } from "@openfront/engine/game/Uci";
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

  test("switch moves every unit to the right side, losing none", () => {
    me.buildUnit(UnitType.City, game.ref(30, 100), {});
    me.buildUnit(UnitType.DefensePost, game.ref(40, 100), {});
    foe.buildUnit(UnitType.City, game.ref(150, 100), {});
    foe.buildUnit(UnitType.City, game.ref(150, 60), {});
    foe.buildUnit(UnitType.DefensePost, game.ref(160, 100), {});
    foe.buildUnit(UnitType.DefensePost, game.ref(160, 120), {});
    uci({ action: "switch", targetID: "foe_id" });
    // Right after the swap, and still after the per-tick capture has run.
    for (let i = 0; i < 2; i++) {
      expect(me.units(UnitType.City).length).toBe(2);
      expect(me.units(UnitType.DefensePost).length).toBe(2);
      expect(foe.units(UnitType.City).length).toBe(1);
      expect(foe.units(UnitType.DefensePost).length).toBe(1);
      for (const u of [...me.units(), ...foe.units()]) {
        expect(game.owner(u.tile())).toBe(u.owner());
      }
      game.executeNextTick();
    }
  });

  test("after switching with a nation, both sides' troops keep growing", () => {
    // A human army near the human ceiling is above a nation's lower cap.
    me.setTroops(game.config().maxTroops(me) * 0.9);
    ai.setTroops(10_000);
    uci({ action: "switch", targetID: "ai_id" });
    for (const p of [me, ai]) {
      expect(p.troops()).toBeLessThanOrEqual(game.config().maxTroops(p));
    }
    // This file's setup never starts troop growth; start it here.
    game.addExecution(new PlayerExecution(me));
    game.addExecution(new PlayerExecution(ai));
    game.executeNextTick();
    const before = [me.troops(), ai.troops()];
    for (let i = 0; i < 30; i++) game.executeNextTick();
    expect(me.troops()).toBeGreaterThan(before[0]);
    expect(ai.troops()).toBeGreaterThan(before[1]);
  });

  test("cede_country and disappear handle every unit, not every other one", () => {
    for (const y of [40, 60, 80, 100, 120]) {
      foe.buildUnit(UnitType.City, game.ref(150, y), {});
    }
    uci({ action: "cede_country", targetID: "foe_id", recipientID: "me_id" });
    expect(foe.units().length).toBe(0);
    expect(me.units(UnitType.City).length).toBe(5);

    for (const y of [40, 60, 80, 100, 120]) {
      ai.buildUnit(UnitType.City, game.ref(90, y), {});
    }
    uci({ action: "disappear", targetID: "ai_id" });
    expect(ai.units().length).toBe(0);
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

describe("UCI create country", () => {
  beforeEach(setupGame);

  /** A closed square outline from (x0,y0) to (x1,y1), as one stroke. */
  function square(x0: number, y0: number, x1: number, y1: number) {
    return {
      points: [
        game.ref(x0, y0),
        game.ref(x1, y0),
        game.ref(x1, y1),
        game.ref(x0, y1),
        game.ref(x0, y0),
      ],
    };
  }

  test("painting a closed border founds an AI nation on everything inside", () => {
    uci({
      action: "create_country",
      text: "Freedonia",
      ...square(10, 10, 40, 40),
    });
    const inside = game.owner(game.ref(25, 25));
    expect(inside.isPlayer()).toBe(true);
    if (!inside.isPlayer()) return;
    expect(inside.displayName()).toBe("Freedonia");
    expect(inside.type()).toBe(PlayerType.Nation);
    // Border and interior: a 31x31 block.
    expect(inside.numTilesOwned()).toBe(31 * 31);
    expect(game.owner(game.ref(5, 5))).toBe(me);
    // It lives on: it has troops and is still standing a while later.
    expect(inside.troops()).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) game.executeNextTick();
    expect(inside.isAlive()).toBe(true);
  });

  test("a spectator can be added as the new country", () => {
    uci({
      action: "create_country",
      text: "Watcher",
      targetClientID: "spectator_client",
      ...square(130, 10, 160, 40),
    });
    const p = game.playerByClientID("spectator_client");
    expect(p).not.toBeNull();
    expect(p!.type()).toBe(PlayerType.Human);
    expect(p!.isAlive()).toBe(true);
    expect(game.owner(game.ref(145, 25))).toBe(p);
  });

  test("a dead player is brought back rather than duplicated", () => {
    for (const t of [...foe.tiles()]) me.conquer(t);
    game.executeNextTick();
    expect(foe.isAlive()).toBe(false);
    uci({
      action: "create_country",
      targetClientID: "foe_client",
      ...square(130, 10, 160, 40),
    });
    expect(game.playerByClientID("foe_client")).toBe(foe);
    expect(foe.isAlive()).toBe(true);
    expect(game.owner(game.ref(145, 25))).toBe(foe);
  });

  test("an open line just takes the line", () => {
    uci({
      action: "create_country",
      points: [game.ref(10, 10), game.ref(40, 10)],
    });
    const p = game.owner(game.ref(25, 10));
    expect(p.isPlayer() && p !== me).toBe(true);
    expect(game.owner(game.ref(25, 20))).toBe(me);
  });
});
