import { SAMLauncherExecution } from "../src/core/execution/SAMLauncherExecution";
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

function samAt(tile: number) {
  const sam = me.buildUnit(UnitType.SAMLauncher, tile, {});
  const exec = new SAMLauncherExecution(me, null, sam);
  exec.init(game, 0);
  return { sam, exec };
}

describe("SAM vs aircraft", () => {
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
    for (const t of land) me.conquer(t);
  });

  test("a SAM engages a hostile fighter in range", () => {
    const { sam, exec } = samAt(land[0]);
    foe.buildUnit(UnitType.FighterJet, land[0], { patrolTile: land[0] });

    const before = sam.missileTimerQueue().length;
    exec.tick(1);
    // A missile was spent on the aircraft.
    expect(sam.missileTimerQueue().length).toBeGreaterThan(before);
  });

  test("it engages military transports", () => {
    const { sam, exec } = samAt(land[0]);
    foe.buildUnit(UnitType.TransportJet, land[0], { troops: 100 });
    const before = sam.missileTimerQueue().length;
    exec.tick(1);
    expect(sam.missileTimerQueue().length).toBeGreaterThan(before);
  });

  test.each([UnitType.CargoJet, UnitType.Airliner, UnitType.Interceptor])(
    "it does NOT engage %s",
    (type) => {
      // Civilian traffic is spared so open borders stay viable; interceptors
      // are spared because they are already fragile to fighters, and ground
      // fire deleting them too would leave no counter to a MIRV.
      //
      // Each case builds its own SAM and its own aircraft - an earlier version
      // looped over all four reusing the map, so a leftover transport from a
      // previous iteration satisfied every assertion and the test passed
      // whatever the targeting rule was.
      const { sam, exec } = samAt(land[0]);
      foe.buildUnit(type, land[0], {
        patrolTile: land[0],
        targetUnit: undefined,
      } as never);
      const before = sam.missileTimerQueue().length;
      exec.tick(1);
      expect(sam.missileTimerQueue().length).toBe(before);
    },
  );

  test("it ignores friendly aircraft", () => {
    const { sam, exec } = samAt(land[0]);
    me.buildUnit(UnitType.FighterJet, land[0], { patrolTile: land[0] });

    const before = sam.missileTimerQueue().length;
    exec.tick(1);
    expect(sam.missileTimerQueue().length).toBe(before);
  });

  test("a disabled SAM does not fire", () => {
    const { sam, exec } = samAt(land[0]);
    foe.buildUnit(UnitType.FighterJet, land[0], { patrolTile: land[0] });
    sam.disable(game.ticks() + 100);

    const before = sam.missileTimerQueue().length;
    exec.tick(1);
    // An EMP burst leaves it standing but inert.
    expect(sam.missileTimerQueue().length).toBe(before);
  });

  test("one shot per cooldown — it cannot engage two aircraft at once", () => {
    const { sam, exec } = samAt(land[0]);
    foe.buildUnit(UnitType.FighterJet, land[0], { patrolTile: land[0] });
    foe.buildUnit(UnitType.Interceptor, land[0], { patrolTile: land[0] });

    const before = sam.missileTimerQueue().length;
    exec.tick(1);
    exec.tick(2);
    expect(sam.missileTimerQueue().length - before).toBe(1);
  });
});
