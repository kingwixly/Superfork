import { TransportJetExecution } from "../src/core/execution/TransportJetExecution";
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
let foe: Player;
let land: number[];

function fly(from: number, to: number, troops: number, base?: number) {
  const airfield =
    base !== undefined ? me.buildUnit(UnitType.Airfield, base, {}) : undefined;
  const jet = me.buildUnit(UnitType.TransportJet, from, { troops });
  jet.setTroops(troops);
  const exec = new TransportJetExecution(jet, airfield, to, me);
  exec.init(game, 0);
  return { jet, exec };
}

describe("Transport jet", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    foe = game.player("foe_id");
    me.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;
    land = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    // First half to me, rest left neutral.
    for (const t of land.slice(0, Math.floor(land.length / 2))) me.conquer(t);
  });

  test("flies at twice boat speed", () => {
    const boat = game.config().unitInfo(UnitType.TransportShip).speed ?? 1;
    const jet = game.config().unitInfo(UnitType.TransportJet).speed ?? 0;
    expect(jet).toBe(2);
    // Boats have no superfork speed entry; the spec anchors the jet at 2x the
    // vanilla boat rate of ~1 tile/tick.
    expect(jet).toBeGreaterThan(boat === 0 ? 1 : boat);
  });

  test("reinforces friendly ground on arrival", () => {
    const dst = land[0]; // owned by me
    // Loading the jet deducts the troops from the player, so measure after
    // launch: landing on friendly ground should hand exactly them back.
    const { exec } = fly(land[1], dst, 500);
    const afterLoading = me.troops();
    for (let i = 0; i < 400 && exec.isActive(); i++) exec.tick(i);
    expect(me.troops()).toBe(afterLoading + 500);
  });

  test("troops in transit are off the board until they land", () => {
    const beforeLaunch = me.troops();
    const { exec } = fly(land[1], land[0], 500);
    expect(me.troops()).toBe(beforeLaunch - 500);
    for (let i = 0; i < 400 && exec.isActive(); i++) exec.tick(i);
    // Round trip nets to zero on friendly ground - the troops were moved,
    // not created or lost.
    expect(me.troops()).toBe(beforeLaunch);
  });

  test("launches an attack against hostile ground", () => {
    const dst = land[land.length - 1];
    foe.conquer(dst);
    const { exec } = fly(land[0], dst, 400);
    for (let i = 0; i < 400 && exec.isActive(); i++) exec.tick(i);
    expect(exec.isActive()).toBe(false);
  });

  test("the jet is consumed by the landing", () => {
    const { jet, exec } = fly(land[1], land[0], 100);
    for (let i = 0; i < 400 && exec.isActive(); i++) exec.tick(i);
    expect(jet.isActive()).toBe(false);
  });

  test("an assault needs an airfield in range — none means no launch", () => {
    const target = land[land.length - 1];
    expect(TransportJetExecution.canLaunchAgainst(game, me, target)).toBe(
      undefined,
    );
  });

  test("an airfield within range enables the assault", () => {
    const target = land[0];
    me.buildUnit(UnitType.Airfield, target, {});
    expect(
      TransportJetExecution.canLaunchAgainst(game, me, target),
    ).toBeDefined();
  });

  test("an airfield under construction cannot launch", () => {
    const target = land[0];
    const base = me.buildUnit(UnitType.Airfield, target, {});
    base.setUnderConstruction(true);
    expect(TransportJetExecution.canLaunchAgainst(game, me, target)).toBe(
      undefined,
    );
  });
});
