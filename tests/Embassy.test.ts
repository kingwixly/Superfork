import {
  EMBASSY_SLOW_DURATION,
  EMBASSY_TROOP_PENALTY,
} from "../src/core/configuration/SuperforkUnits";
import {
  clearPendingEmbassies,
  EmbassyRequestExecution,
  EmbassyResponseExecution,
  pendingEmbassyBetween,
} from "../src/core/execution/EmbassyExecution";
import { NationDiplomacyBehavior } from "../src/core/execution/nation/NationDiplomacyBehavior";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";

let game: Game;
let guest: Player;
let host: Player;
let hostTile: number;

function request(tile = hostTile) {
  new EmbassyRequestExecution(guest, host.id(), tile).init(game, 0);
}
function respond(accept: boolean) {
  new EmbassyResponseExecution(host, guest.id(), accept).init(game, 0);
}

describe("Embassy", () => {
  beforeEach(async () => {
    clearPendingEmbassies();
    game = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("guest", PlayerType.Human, null, "g_id"),
      new PlayerInfo("host", PlayerType.Human, null, "h_id"),
    ]);
    guest = game.player("g_id");
    host = game.player("h_id");
    const land: number[] = [];
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) land.push(t);
      }
    }
    const half = Math.floor(land.length / 2);
    for (const t of land.slice(0, half)) guest.conquer(t);
    for (const t of land.slice(half)) host.conquer(t);
    hostTile = land[half];
    guest.addGold(10_000_000n);
  });

  test("a guest who cannot pay cannot ask", () => {
    guest.removeGold(guest.gold());
    request();
    expect(pendingEmbassyBetween(guest, host)).toBeUndefined();
  });

  test("opening charges the guest", () => {
    const before = guest.gold();
    request();
    respond(true);
    expect(guest.units(UnitType.Embassy).length).toBe(1);
    expect(guest.gold()).toBeLessThan(before);
  });

  test("placement requires the host's consent", () => {
    request();
    expect(pendingEmbassyBetween(guest, host)).toBeDefined();
    // Nothing built until accepted.
    expect(guest.units(UnitType.Embassy).length).toBe(0);
  });

  test("accepting builds it — owned by the guest, on the host's land", () => {
    request();
    respond(true);

    const embassies = guest.units(UnitType.Embassy);
    expect(embassies.length).toBe(1);
    // Foreign ownership inside another nation's borders is the mechanic.
    expect(embassies[0].owner()).toBe(guest);
    expect(game.owner(hostTile)).toBe(host);
  });

  test("it survives on the host's land instead of being captured next tick", () => {
    request();
    respond(true);
    // PlayerExecution hands any structure to whoever owns its tile, so the
    // host used to capture the embassy immediately and it never appeared.
    const pe = new PlayerExecution(host);
    pe.init(game, game.ticks());
    pe.tick(game.ticks());
    const embassy = guest.units(UnitType.Embassy)[0];
    expect(embassy?.owner()).toBe(guest);
    expect(embassy?.embassyHost()).toBe(host);
  });

  test("declining builds nothing", () => {
    request();
    respond(false);
    expect(guest.units(UnitType.Embassy).length).toBe(0);
  });

  test("the tile must belong to the host", () => {
    // A tile the guest owns is not a valid embassy site.
    request(0);
    expect(pendingEmbassyBetween(guest, host)).toBeUndefined();
  });

  test("seizing an embassy costs its owner a tenth of their army", () => {
    request();
    respond(true);
    const embassy = guest.units(UnitType.Embassy)[0];

    guest.setTroops(10_000);
    embassy.setOwner(host);

    expect(guest.troops()).toBe(10_000 - 10_000 * EMBASSY_TROOP_PENALTY);
  });

  test("seizing slows the loser's advance", () => {
    request();
    respond(true);
    const embassy = guest.units(UnitType.Embassy)[0];

    guest.setTroops(5000);
    embassy.setOwner(host);

    expect(guest.isTroopSlowed()).toBe(true);
  });

  test("the slow wears off", () => {
    request();
    respond(true);
    const embassy = guest.units(UnitType.Embassy)[0];
    guest.setTroops(5000);
    embassy.setOwner(host);

    for (let i = 0; i <= EMBASSY_SLOW_DURATION; i++) game.executeNextTick();
    expect(guest.isTroopSlowed()).toBe(false);
  });

  test("recapture flips the penalty onto the other side", () => {
    request();
    respond(true);
    const embassy = guest.units(UnitType.Embassy)[0];

    guest.setTroops(10_000);
    host.setTroops(10_000);

    embassy.setOwner(host); // host seizes it
    expect(guest.troops()).toBeLessThan(10_000);

    const hostBefore = host.troops();
    embassy.setOwner(guest); // guest takes it back
    expect(host.troops()).toBeLessThan(hostBefore);
    expect(host.isTroopSlowed()).toBe(true);
  });

  test("an embassy carries no troops of its own", () => {
    request();
    respond(true);
    expect(guest.units(UnitType.Embassy)[0].troops()).toBe(0);
  });
});

describe("Embassy requests to AI nations", () => {
  test("a nation answers instead of leaving the request hanging", async () => {
    clearPendingEmbassies();
    const g = await setup("half_land_half_ocean", { instantBuild: true }, [
      new PlayerInfo("guest", PlayerType.Human, null, "g_id"),
      new PlayerInfo("ai", PlayerType.Nation, null, "ai_id"),
    ]);
    const gst = g.player("g_id");
    const ai = g.player("ai_id");
    const land: number[] = [];
    for (let x = 0; x < g.width(); x++) {
      for (let y = 0; y < g.height(); y++) {
        const t = g.ref(x, y);
        if (g.isLand(t)) land.push(t);
      }
    }
    const half = Math.floor(land.length / 2);
    for (const t of land.slice(0, half)) gst.conquer(t);
    for (const t of land.slice(half)) ai.conquer(t);
    gst.addGold(10_000_000n);

    new EmbassyRequestExecution(gst, ai.id(), land[half]).init(g, 0);
    expect(pendingEmbassyBetween(gst, ai)).toBeDefined();

    const brain = new NationDiplomacyBehavior(new PseudoRandom(1), g, ai);
    for (let i = 0; i < 400 && pendingEmbassyBetween(gst, ai); i++) {
      brain.tick();
      g.executeNextTick();
    }
    expect(pendingEmbassyBetween(gst, ai)).toBeUndefined();
  });
});
