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
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
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
