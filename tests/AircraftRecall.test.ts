/**
 * The recall_aircraft order: the X next to an aircraft on the attacks bar.
 * Each kind of aircraft is called off its mission in its own way.
 */
import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { RecallAircraftExecution } from "@openfront/engine/execution/MoveAircraftExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let me: Player;
let foe: Player;
let base: number;

beforeEach(async () => {
  game = await setup("big_plains", { instantBuild: true }, [
    new PlayerInfo("me", PlayerType.Human, null, "me_id"),
    new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
  ]);
  while (game.inSpawnPhase() || game.isSpawnImmunityActive()) {
    game.executeNextTick();
  }
  me = game.player("me_id");
  foe = game.player("foe_id");
  game.config().structureMinDist = () => 1;
  const land: number[] = [];
  for (let x = 0; x < game.width(); x++) {
    for (let y = 0; y < game.height(); y++) {
      const t = game.ref(x, y);
      if (game.isLand(t)) land.push(t);
    }
  }
  // big_plains is all land, 200x200: the east 40 columns are mine.
  for (const t of land.slice(0, -8000)) foe.conquer(t);
  for (const t of land.slice(-8000)) me.conquer(t);
  base = game.ref(185, 100);
  me.buildUnit(UnitType.Airfield, base, {});
  me.addGold(200_000_000n);
});

function order(type: UnitType, at: number) {
  game.addExecution(new ConstructionExecution(me, type, at));
}
function run(ticks: number) {
  for (let i = 0; i < ticks; i++) game.executeNextTick();
}
function recall(...ids: number[]) {
  game.addExecution(new RecallAircraftExecution(me, ids));
  run(1);
}
const near = (a: number, b: number, d = 3) => game.manhattanDist(a, b) <= d;

test("a recalled transport jet turns round and its troops rejoin the army", () => {
  order(UnitType.TransportJet, game.ref(130, 100));
  run(3);
  const [jet] = me.units(UnitType.TransportJet);
  expect(jet).toBeDefined();
  const carried = jet.troops();
  expect(carried).toBeGreaterThan(0);
  expect(jet.targetTile()).toBe(game.ref(130, 100));

  recall(jet.id());
  expect(jet.targetTile()).toBe(base); // shown as returning
  const before = me.troops();
  run(80);
  expect(jet.isActive()).toBe(false);
  // Troops came home (allowing for normal troop growth), and no landing
  // happened in the foe's land.
  expect(me.troops()).toBeGreaterThanOrEqual(before + carried * 0.99);
  expect(game.owner(game.ref(130, 100))).toBe(foe);
});

test("a recalled fighter goes back to patrolling its base", () => {
  const front = game.ref(150, 100);
  order(UnitType.FighterJet, front);
  run(3);
  const [fighter] = me.units(UnitType.FighterJet);
  expect(fighter.targetTile()).toBe(front); // tasked: patrol point published
  run(20);
  recall(fighter.id());
  expect(fighter.targetTile()).toBeUndefined();
  run(60);
  // Patrolling the base now: within its circuit radius of home.
  expect(game.manhattanDist(fighter.tile(), base)).toBeLessThanOrEqual(30);
});

test("a recalled bomber aborts the run, flies home and waits", () => {
  order(UnitType.Bomber, game.ref(120, 100));
  run(3);
  const [bomber] = me.units(UnitType.Bomber);
  expect(bomber.targetTile()).toBeDefined();
  run(10);
  recall(bomber.id());
  expect(bomber.targetTile()).toBeUndefined();
  run(80);
  expect(bomber.isActive()).toBe(true);
  expect(near(bomber.tile(), base)).toBe(true);
});

test("an aborted strike refunds its payload and the bomber comes home", () => {
  order(UnitType.StealthBomber, base);
  run(2);
  const [bomber] = me.units(UnitType.StealthBomber);
  const gold = me.gold();
  order(UnitType.BunkerBuster, game.ref(60, 100));
  run(3);
  expect(me.gold()).toBeLessThan(gold);
  expect(bomber.targetTile()).toBe(game.ref(60, 100));

  recall(bomber.id());
  expect(me.gold()).toBe(gold);
  expect(bomber.targetTile()).toBeUndefined();
  run(120);
  expect(near(bomber.tile(), base)).toBe(true);
  // No strike landed.
  expect(game.units(UnitType.BunkerBuster).length).toBe(0);
});

test("you cannot recall someone else's aircraft", () => {
  order(UnitType.TransportJet, game.ref(130, 100));
  run(3);
  const [jet] = me.units(UnitType.TransportJet);
  game.addExecution(new RecallAircraftExecution(foe, [jet.id()]));
  run(1);
  expect(jet.targetTile()).toBe(game.ref(130, 100));
});
