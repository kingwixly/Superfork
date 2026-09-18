import {
  ASBM_WARHEAD_COUNT,
  ASBMExecution,
} from "../src/core/execution/ASBMExecution";
import {
  EMP_DISABLE_DURATION,
  NEUTRON_KILL_SHARE,
  SpecialWarheadExecution,
} from "../src/core/execution/SpecialWarheadExecution";
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
let water: number;

function fire(type: UnitType.NeutronBomb | UnitType.EMPBomb, at: number) {
  // These warheads FLY now - they launch from a silo and travel, so anything
  // with an interception radius gets a chance at them. Detonation therefore
  // takes many ticks, not one.
  const e = new SpecialWarheadExecution(me, type, at);
  e.init(game, 0);
  for (let i = 0; i < 2000 && e.isActive(); i++) e.tick(i);
}

describe("Special warheads", () => {
  beforeEach(async () => {
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("me", PlayerType.Human, null, "me_id"),
      new PlayerInfo("foe", PlayerType.Human, null, "foe_id"),
    ]);
    me = game.player("me_id");
    foe = game.player("foe_id");
    me.addGold(100_000_000n);
    foe.addGold(100_000_000n);
    game.config().structureMinDist = () => 1;

    land = [];
    water = -1;
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
        else if (water < 0 && game.isWater(t)) water = t;
      }
    }
    for (const t of land) foe.conquer(t);
  });

  test("a neutron bomb kills troops", () => {
    foe.setTroops(10_000);
    fire(UnitType.NeutronBomb, land[0]);
    expect(foe.troops()).toBe(10_000 - 10_000 * NEUTRON_KILL_SHARE);
  });

  test("a neutron bomb leaves buildings and ground intact", () => {
    const city = foe.buildUnit(UnitType.City, land[0], {});
    const before = foe.numTilesOwned();
    foe.setTroops(10_000);

    fire(UnitType.NeutronBomb, land[0]);

    // The inverse of every other nuke: take the ground, do not deny it.
    expect(city.isActive()).toBe(true);
    expect(foe.numTilesOwned()).toBe(before);
  });

  test("a neutron bomb spares the launcher's own troops", () => {
    me.setTroops(8000);
    fire(UnitType.NeutronBomb, land[0]);
    expect(me.troops()).toBe(8000);
  });

  test("an EMP disables structures without destroying them", () => {
    const sam = foe.buildUnit(UnitType.SAMLauncher, land[0], {});
    fire(UnitType.EMPBomb, land[0]);

    expect(sam.isActive()).toBe(true);
    expect(sam.isDisabled()).toBe(true);
  });

  test("the disable wears off", () => {
    const sam = foe.buildUnit(UnitType.SAMLauncher, land[0], {});
    fire(UnitType.EMPBomb, land[0]);
    for (let i = 0; i <= EMP_DISABLE_DURATION; i++) game.executeNextTick();
    expect(sam.isDisabled()).toBe(false);
  });

  test("an EMP grounds aircraft caught inside it", () => {
    const jet = foe.buildUnit(UnitType.FighterJet, land[0], {
      patrolTile: land[0],
    });
    fire(UnitType.EMPBomb, land[0]);
    expect(jet.isActive()).toBe(false);
  });

  test("an EMP kills no troops", () => {
    foe.setTroops(10_000);
    fire(UnitType.EMPBomb, land[0]);
    expect(foe.troops()).toBe(10_000);
  });

  test("an EMP spares the launcher's own structures", () => {
    const mine = me.buildUnit(UnitType.SAMLauncher, land[0], {});
    fire(UnitType.EMPBomb, land[0]);
    expect(mine.isDisabled()).toBe(false);
  });

  test("an ASBM sinks ships and ignores everything else", () => {
    const ship = foe.buildUnit(UnitType.Warship, water, { patrolTile: water });
    const city = foe.buildUnit(UnitType.City, land[0], {});

    const e = new ASBMExecution(me, foe.id());
    e.init(game, 0);
    e.tick(0);

    expect(ship.isActive()).toBe(false);
    expect(city.isActive()).toBe(true);
  });

  test("an ASBM salvo is finite", () => {
    const ships = [];
    for (let i = 0; i < ASBM_WARHEAD_COUNT + 5; i++) {
      ships.push(
        foe.buildUnit(UnitType.Corvette, water, { patrolTile: water }),
      );
    }
    const e = new ASBMExecution(me, foe.id());
    e.init(game, 0);
    e.tick(0);

    const sunk = ships.filter((s) => !s.isActive()).length;
    expect(sunk).toBe(ASBM_WARHEAD_COUNT);
  });

  test("an ASBM prefers the carrier over the escorts", () => {
    const carrier = foe.buildUnit(UnitType.Carrier, water, {
      patrolTile: water,
    });
    const corvettes = [];
    for (let i = 0; i < ASBM_WARHEAD_COUNT; i++) {
      corvettes.push(
        foe.buildUnit(UnitType.Corvette, water, { patrolTile: water }),
      );
    }
    const e = new ASBMExecution(me, foe.id());
    e.init(game, 0);
    e.tick(0);

    expect(carrier.isActive()).toBe(false);
  });
});

describe("Superfork warheads are interceptable", () => {
  test("a shot-down neutron bomb never detonates", () => {
    foe.setTroops(10_000);
    const e = new SpecialWarheadExecution(me, UnitType.NeutronBomb, land[0]);
    e.init(game, 0);
    e.tick(0); // launch only

    // Kill it mid-flight, as a SAM or interceptor would.
    const inFlight = me.units(UnitType.NeutronBomb)[0];
    expect(inFlight).toBeDefined();
    inFlight.delete(true, foe);

    for (let i = 1; i < 2000 && e.isActive(); i++) e.tick(i);

    // Troops survive: the payload never went off.
    expect(foe.troops()).toBe(10_000);
  });

  test("a shot-down EMP leaves structures working", () => {
    const sam = foe.buildUnit(UnitType.SAMLauncher, land[0], {});
    const e = new SpecialWarheadExecution(me, UnitType.EMPBomb, land[0]);
    e.init(game, 0);
    e.tick(0);

    me.units(UnitType.EMPBomb)[0].delete(true, foe);
    for (let i = 1; i < 2000 && e.isActive(); i++) e.tick(i);

    expect(sam.isDisabled()).toBe(false);
  });

  test("they exist as units while in flight, so something can engage them", () => {
    const e = new SpecialWarheadExecution(me, UnitType.NeutronBomb, land[0]);
    e.init(game, 0);
    e.tick(0);
    expect(me.units(UnitType.NeutronBomb).length).toBe(1);
  });
});
