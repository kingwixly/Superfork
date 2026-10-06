import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { TransportJetExecution } from "../src/core/execution/TransportJetExecution";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

describe("Transport jet landings", () => {
  test("an air landing inside enemy land is not absorbed straight away", async () => {
    const game = await setup("plains", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    const me = game.player("me_id");
    const foe = game.player("foe_id");
    const land: number[] = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    // Foe holds everything except a strip on the left edge for me.
    for (const t of land) {
      if (game.x(t) < 5) me.conquer(t);
      else foe.conquer(t);
    }
    me.setTroops(50_000);
    foe.setTroops(1_000_000);
    const target = game.ref(
      Math.floor(game.width() / 2),
      Math.floor(game.height() / 2),
    );
    expect(game.owner(target)).toBe(foe);

    const jet = me.buildUnit(UnitType.TransportJet, target, {
      targetTile: target,
      troops: 1000,
    });
    const exec = new TransportJetExecution(jet, undefined, target, me);
    exec.init(game, game.ticks());
    for (let i = 0; i < 50 && exec.isActive(); i++) exec.tick(game.ticks());
    expect(game.owner(target)).toBe(me);

    // The enclave check runs in the lander's PlayerExecution. It used to hand
    // the whole beachhead back on the first pass.
    const pe = new PlayerExecution(me);
    pe.init(game, game.ticks());
    (pe as unknown as { removeClusters(): void }).removeClusters();
    expect(game.owner(target)).toBe(me);
  });
});
