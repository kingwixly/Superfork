import { SanctionExecution } from "../src/core/execution/SanctionExecution";
import { canFlyOver } from "../src/core/game/Airspace";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let them: Player;
let land: number[];

function sanction(action: "start" | "stop") {
  const exec = new SanctionExecution(me, them.id(), action);
  exec.init(game, 0);
}

describe("Sanctions", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("them", PlayerType.Human, null, "them_id"),
    ]);
    me = game.player("me_id");
    them = game.player("them_id");
    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    const half = Math.floor(land.length / 2);
    for (const t of land.slice(0, half)) me.conquer(t);
    for (const t of land.slice(half)) them.conquer(t);
  });

  test("trade is open before any sanction", () => {
    expect(me.canTrade(them)).toBe(true);
  });

  test("a sanction blocks trade in both directions", () => {
    sanction("start");
    // canTrade is what trade ships, trains, ports and the AI all consult, so
    // blocking it here is what implements 'no ships or trains crossing'.
    expect(me.canTrade(them)).toBe(false);
    expect(them.canTrade(me)).toBe(false);
  });

  test("a sanction closes the sanctioner's airspace to the target", () => {
    sanction("start");
    expect(canFlyOver(game, them, land[0])).toBe(false);
    // ...and only in that direction.
    expect(canFlyOver(game, me, land[land.length - 1])).toBe(true);
  });

  test("a sanction overrides an open border policy", () => {
    me.setBorderPolicy(true, true);
    expect(me.acceptsCivilianFlightsFrom(them)).toBe(true);
    sanction("start");
    expect(me.acceptsCivilianFlightsFrom(them)).toBe(false);
  });

  test("lifting a sanction restores trade and airspace", () => {
    sanction("start");
    sanction("stop");
    expect(me.canTrade(them)).toBe(true);
    expect(canFlyOver(game, them, land[0])).toBe(true);
    expect(me.getSanctions().length).toBe(0);
  });

  test("sanctioning twice is idempotent", () => {
    sanction("start");
    sanction("start");
    expect(me.getSanctions().length).toBe(1);
  });

  test("a nation cannot sanction itself", () => {
    const exec = new SanctionExecution(me, me.id(), "start");
    exec.init(game, 0);
    expect(me.getSanctions().length).toBe(0);
  });

  test("an unknown target is ignored rather than throwing", () => {
    const exec = new SanctionExecution(me, "nobody", "start");
    expect(() => exec.init(game, 0)).not.toThrow();
    expect(me.getSanctions().length).toBe(0);
  });

  test("sanctions are wider than embargoes — an embargo leaves the sky open", () => {
    me.addEmbargo(them, false);
    expect(me.canTrade(them)).toBe(false);
    // An embargo cuts trade only; the airspace stays open.
    expect(canFlyOver(game, them, land[0])).toBe(true);
  });
});
