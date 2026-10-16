/** Superfork accounts: sign-in, spending, unlocks and payouts. */
import fs from "fs";
import os from "os";
import path from "path";
import { AccountStore } from "../src/server/accounts/AccountStore";

let file: string;
let store: AccountStore;

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sf-acc-")), "a.json");
  store = new AccountStore(file);
});

test("register, sign in, and sessions survive a restart", async () => {
  const t1 = await store.register("Dani_1", "hunter22");
  expect(store.bySession(t1)?.username).toBe("Dani_1");
  await expect(store.register("dani_1", "whatever")).rejects.toThrow(
    "username_taken",
  );
  await expect(store.login("Dani_1", "wrong")).rejects.toThrow("bad_login");
  const t2 = await store.login("DANI_1", "hunter22");
  const reloaded = new AccountStore(file);
  expect(reloaded.bySession(t2)?.username).toBe("Dani_1");
  // Tokens are never stored, only their hashes.
  expect(fs.readFileSync(file, "utf8")).not.toContain(t2);
  reloaded.logout(t2);
  expect(reloaded.bySession(t2)).toBeNull();
});

test("bad usernames and passwords are refused", async () => {
  await expect(store.register("a", "hunter22")).rejects.toThrow("bad_username");
  await expect(store.register("ok_name", "123")).rejects.toThrow(
    "bad_password",
  );
});

test("coins buy cosmetics and research points; RP buys the tree", async () => {
  const a = store.bySession(await store.register("buyer", "hunter22"))!;
  expect(() => store.buyCosmetic(a, "crown:royal_crown", 500)).toThrow(
    "not_enough_coins",
  );
  store.reward(a, "g1", 1000, 0);
  store.buyCosmetic(a, "crown:royal_crown", 500);
  expect(a.owned).toContain("crown:royal_crown");
  expect(() => store.buyCosmetic(a, "crown:royal_crown", 500)).toThrow(
    "already_owned",
  );
  store.buyResearch(a, 200); // 400 coins
  expect(a.coins).toBe(100);
  expect(a.rp).toBe(200);
  expect(() => store.unlock(a, "capital", false)).toThrow("locked");
  store.unlock(a, "bank", false);
  expect(a.rp).toBe(100);
  expect(a.nodes).toEqual(["bank"]);
  // A first buff level costs 150 RP.
  expect(() => store.buff(a, "gold", false)).toThrow("not_enough_rp");
  a.rp = 150;
  store.buff(a, "gold", false);
  expect(a.rp).toBe(0);
  expect(a.buffs[0]).toBe(1);
});

test("admins unlock without paying", async () => {
  const a = store.bySession(await store.register("admin1", "hunter22"))!;
  store.unlock(a, "warship", true);
  store.buff(a, "gold", true);
  expect(a.rp).toBe(0);
  expect(store.progression(a, true).bypass).toBe(true);
});

test("a game pays once, and RP is capped per match", async () => {
  const a = store.bySession(await store.register("winner", "hunter22"))!;
  expect(store.reward(a, "game1", 200, 99_999)).toBe(true);
  expect(store.reward(a, "game1", 200, 10)).toBe(false);
  expect(a.coins).toBe(200);
  expect(a.rp).toBe(2000);
});

test("only unlocked governments can be the starting one", async () => {
  const a = store.bySession(await store.register("gov_user", "hunter22"))!;
  expect(() => store.setGovernment(a, "democracy", false)).toThrow("locked");
  a.rp = 1000;
  store.unlock(a, "gov_democracy", false);
  store.setGovernment(a, "democracy", false);
  expect(store.progression(a, false).government).toBe("democracy");
});
