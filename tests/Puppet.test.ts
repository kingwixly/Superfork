import { AttackExecution } from "../src/core/execution/AttackExecution";
import {
  canPuppet,
  PuppetCommandExecution,
  PuppetLiberateExecution,
} from "../src/core/execution/PuppetExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let master: Player;
let puppet: Player;
let target: Player;
let outsider: Player;

describe("Puppet states", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", {}, [
      new PlayerInfo("master", PlayerType.Human, null, "m_id"),
      new PlayerInfo("puppet", PlayerType.Human, null, "p_id"),
      new PlayerInfo("target", PlayerType.Human, null, "t_id"),
      new PlayerInfo("outsider", PlayerType.Human, null, "o_id"),
    ]);
    master = game.player("m_id");
    puppet = game.player("p_id");
    target = game.player("t_id");
    outsider = game.player("o_id");

    const land: number[] = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    const n = Math.floor(land.length / 4);
    for (const t of land.slice(0, n)) master.conquer(t);
    for (const t of land.slice(n, n * 2)) puppet.conquer(t);
    for (const t of land.slice(n * 2, n * 3)) target.conquer(t);
    for (const t of land.slice(n * 3)) outsider.conquer(t);
    puppet.setTroops(10_000);
    puppet.setMaster(master);
  });

  test("a master lists its puppets", () => {
    expect(master.puppets().map((p) => p.id())).toEqual([puppet.id()]);
    expect(puppet.master()?.id()).toBe(master.id());
  });

  test("cycles are refused", () => {
    // puppet already answers to master, so master cannot answer to puppet.
    expect(canPuppet(puppet, master)).toBe(false);
    expect(canPuppet(master, outsider)).toBe(true);
  });

  test("a nation cannot puppet itself", () => {
    expect(canPuppet(master, master)).toBe(false);
  });

  test("a master can point its puppet at a target", () => {
    const e = new PuppetCommandExecution(master, puppet.id(), target.id());
    e.init(game, 0);
    game.executeNextTick();
    expect(puppet.outgoingAttacks().length).toBeGreaterThan(0);
  });

  test("a puppet is never turned on its own master", () => {
    const e = new PuppetCommandExecution(master, puppet.id(), master.id());
    e.init(game, 0);
    game.executeNextTick();
    expect(puppet.outgoingAttacks().length).toBe(0);
  });

  test("only the real master may command it", () => {
    const e = new PuppetCommandExecution(outsider, puppet.id(), target.id());
    e.init(game, 0);
    game.executeNextTick();
    expect(puppet.outgoingAttacks().length).toBe(0);
  });

  test("puppets follow their master into war automatically", () => {
    // The master attacks; the puppet joins without being told. Hooked in
    // AttackExecution so it fires however the war started.
    master.setTroops(10_000);
    const attack = new AttackExecution(2000, master, target.id(), null, false);
    attack.init(game, 0);
    game.executeNextTick();

    expect(puppet.outgoingAttacks().length).toBeGreaterThan(0);
  });

  test("a freed nation no longer follows its former master", () => {
    new PuppetLiberateExecution(outsider, puppet.id()).init(game, 0);
    master.setTroops(10_000);
    const attack = new AttackExecution(2000, master, target.id(), null, false);
    attack.init(game, 0);
    game.executeNextTick();

    expect(puppet.outgoingAttacks().length).toBe(0);
  });

  test("anyone can liberate a puppet", () => {
    const e = new PuppetLiberateExecution(outsider, puppet.id());
    e.init(game, 0);
    expect(puppet.master()).toBeNull();
  });

  test("the liberator allies the freed nation", () => {
    const e = new PuppetLiberateExecution(outsider, puppet.id());
    e.init(game, 0);
    expect(outsider.isFriendly(puppet)).toBe(true);
  });

  test("a master cannot liberate its own puppet", () => {
    // Releasing a vassal is a different act, and would otherwise auto-ally
    // them straight back to the master.
    const e = new PuppetLiberateExecution(master, puppet.id());
    e.init(game, 0);
    expect(puppet.master()?.id()).toBe(master.id());
  });

  test("liberating clears the master's puppet list", () => {
    new PuppetLiberateExecution(outsider, puppet.id()).init(game, 0);
    expect(master.puppets().length).toBe(0);
  });
});
