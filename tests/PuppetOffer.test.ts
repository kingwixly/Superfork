/** Offering to take a nation as a puppet, and its answer. */
import { PlayerInfo, PlayerType } from "@openfront/engine-api/game/GameTypes";
import {
  nationAcceptsPuppetOffer,
  pendingPuppetOffer,
  PuppetOfferExecution,
  PuppetResponseExecution,
} from "@openfront/engine/execution/PuppetExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";

let game: Game;
let big: Player;
let small: Player;

beforeEach(async () => {
  game = await setup("big_plains", { instantBuild: true, provinces: true }, [
    new PlayerInfo("big", PlayerType.Human, null, "big_id"),
    new PlayerInfo("small", PlayerType.Human, null, "small_id"),
  ]);
  big = game.player("big_id");
  small = game.player("small_id");
  for (let x = 0; x < game.width(); x++) {
    for (let y = 0; y < game.height(); y++) {
      (x < 180 ? big : small).conquer(game.ref(x, y));
    }
  }
  big.setTroops(500_000);
  small.setTroops(10_000);
});

function run(e: { init(g: Game, t: number): void }) {
  e.init(game, game.ticks());
}

test("an accepted offer makes a puppet that counts as a province", () => {
  const before = big.provinceCount();
  run(new PuppetOfferExecution(big, small.id()));
  expect(pendingPuppetOffer(game, big, small)).toBeDefined();
  run(new PuppetResponseExecution(small, big.id(), true));
  expect(small.master()).toBe(big);
  expect(big.isFriendly(small)).toBe(true);
  expect(big.provinceCount()).toBe(before + 1);
});

test("a declined offer changes nothing", () => {
  run(new PuppetOfferExecution(big, small.id()));
  run(new PuppetResponseExecution(small, big.id(), false));
  expect(small.master()).toBeNull();
  expect(pendingPuppetOffer(game, big, small)).toBeUndefined();
});

test("the one who offered cannot accept for the other", () => {
  run(new PuppetOfferExecution(big, small.id()));
  run(new PuppetResponseExecution(big, small.id(), true));
  expect(small.master()).toBeNull();
  expect(big.master()).toBeNull();
});

test("nations only accept when hopelessly outmatched", () => {
  expect(nationAcceptsPuppetOffer(small, big)).toBe(true);
  expect(nationAcceptsPuppetOffer(big, small)).toBe(false);
});
