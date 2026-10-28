import { Difficulty } from "@openfront/engine-api/game/GameTypes";
import {
  BUFF_IDS,
  buffCost,
  BUFFS,
  canUnlockNode,
  COINS_PER_RP,
  coinsForWin,
  GovernmentId,
  MAX_RP_PER_MATCH,
  Progression,
  TREE_BY_ID,
  unlockedGovernments,
} from "@openfront/engine-api/game/Progression";
import { ADMIN_FLARES } from "@openfront/shared/BundledCosmetics";
import {
  decodeGuest,
  encodeGuest,
  GUEST_COOKIE,
  GuestProgress,
} from "@openfront/shared/GuestProgress";

/**
 * Superfork progression on the client: coins, research points, owned
 * cosmetics and the research tree, for a signed-in account (kept on the
 * server) or a guest (kept in the sf_guest cookie).
 *
 * Small and free of game-client imports, so the homepage can load it.
 */

export interface AccountProfile {
  username: string;
  coins: number;
  rp: number;
  owned: string[];
  nodes: string[];
  buffs: number[];
  government: GovernmentId;
  admin: boolean;
}

export interface ProgressState {
  profile: AccountProfile | null;
  guest: GuestProgress;
  /** Signed in to the gate as admin: everything is free and unlocked. */
  admin: boolean;
}

/** Fired on window whenever coins, RP or unlocks change. */
export const PROGRESS_CHANGED = "superfront-progress-changed";

/** Fired on window to open the SuperFront account panel. */
export const OPEN_ACCOUNT = "superfront-open-account";

/**
 * Open the SuperFront account panel. Every "sign in" / "view account" link
 * lands here: the original OpenFront login (Discord, Google, Steam, email)
 * talks to openfront.io's closed API, which this server has no part in.
 */
export function openAccount(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT));
  }
}

let state: ProgressState = {
  profile: null,
  guest: readGuest(),
  admin: false,
};
let loading: Promise<ProgressState> | null = null;

function readGuest(): GuestProgress {
  if (typeof document === "undefined") return decodeGuest(undefined);
  const raw = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GUEST_COOKIE}=`));
  return decodeGuest(raw?.slice(GUEST_COOKIE.length + 1));
}

function writeGuest(g: GuestProgress): void {
  state = { ...state, guest: g };
  if (typeof document !== "undefined") {
    document.cookie = `${GUEST_COOKIE}=${encodeGuest(g)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  changed();
}

function changed(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED));
  }
}

export function progressState(): ProgressState {
  return state;
}

/** Fetch the account (if signed in). Safe to call often; deduplicated. */
export function loadProgress(force = false): Promise<ProgressState> {
  if (loading !== null && !force) return loading;
  loading = (async () => {
    try {
      const res = await fetch("/api/account/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as {
          profile: AccountProfile | null;
          admin: boolean;
        };
        state = { ...state, profile: j.profile, admin: j.admin === true };
      }
    } catch {
      // No account server (or offline): guest mode.
    }
    state = { ...state, guest: readGuest() };
    changed();
    return state;
  })();
  return loading;
}

async function post(
  path: string,
  body: unknown,
): Promise<AccountProfile | null> {
  const res = await fetch(`/api/account/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-sf-account": "1" },
    body: JSON.stringify(body ?? {}),
  });
  const j = (await res.json().catch(() => ({}))) as {
    profile?: AccountProfile | null;
    error?: string;
  };
  if (!res.ok) throw new Error(j.error ?? "server_error");
  state = { ...state, profile: j.profile ?? null };
  changed();
  return j.profile ?? null;
}

export const register = (username: string, password: string) =>
  post("register", { username, password });
export const login = (username: string, password: string) =>
  post("login", { username, password });
export const logout = () => post("logout", {});

// ----------------------------------------------------------------- reads --

export const signedIn = () => state.profile !== null;
export const isAdmin = () => state.admin || state.profile?.admin === true;
export const coins = () => state.profile?.coins ?? state.guest.c;
export const researchPoints = () => state.profile?.rp ?? state.guest.r;
export const ownedItems = () => state.profile?.owned ?? state.guest.o;
export const unlockedNodes = () => state.profile?.nodes ?? state.guest.n;
export const buffLevels = () => state.profile?.buffs ?? state.guest.b;
export const startGovernment = (): GovernmentId =>
  state.profile?.government ?? state.guest.g;

/** Cosmetic flares this player holds (flags are always free). */
export function ownedFlares(): string[] {
  if (isAdmin()) return [...ADMIN_FLARES];
  return ["flag:*", ...ownedItems()];
}

export function ownsFlare(flare: string): boolean {
  if (isAdmin()) return true;
  return ownedItems().includes(flare);
}

/** The progression this player brings into a game. */
export function myProgression(): Progression {
  return {
    ...(isAdmin() ? { bypass: true } : {}),
    nodes: [...unlockedNodes()],
    buffs: [...buffLevels()],
    government: startGovernment(),
  };
}

// --------------------------------------------------------------- spending --

export async function buyCosmetic(flare: string, price: number) {
  if (isAdmin() || ownsFlare(flare)) return;
  if (signedIn()) return void (await post("buy-cosmetic", { flare }));
  const g = state.guest;
  if (g.c < price) throw new Error("not_enough_coins");
  writeGuest({ ...g, c: g.c - price, o: [...g.o, flare] });
}

export async function buyResearch(rp: number) {
  if (signedIn()) return void (await post("buy-rp", { rp }));
  const g = state.guest;
  const cost = rp * COINS_PER_RP;
  if (g.c < cost) throw new Error("not_enough_coins");
  writeGuest({ ...g, c: g.c - cost, r: g.r + rp });
}

export async function unlockNode(id: string) {
  if (signedIn()) return void (await post("unlock", { node: id }));
  const g = state.guest;
  const node = TREE_BY_ID.get(id);
  if (node === undefined || !canUnlockNode(id, g.n)) throw new Error("locked");
  if (!isAdmin() && g.r < node.cost) throw new Error("not_enough_rp");
  writeGuest({ ...g, r: isAdmin() ? g.r : g.r - node.cost, n: [...g.n, id] });
}

export async function levelBuff(id: (typeof BUFF_IDS)[number]) {
  if (signedIn()) return void (await post("buff", { buff: id }));
  const g = state.guest;
  const i = BUFF_IDS.indexOf(id);
  const b = [...g.b];
  while (b.length < BUFF_IDS.length) b.push(0);
  if (b[i] >= BUFFS[id].maxLevel) throw new Error("max_level");
  const cost = buffCost(b[i]);
  if (!isAdmin() && g.r < cost) throw new Error("not_enough_rp");
  b[i]++;
  writeGuest({ ...g, r: isAdmin() ? g.r : g.r - cost, b });
}

export async function chooseStartGovernment(id: GovernmentId) {
  if (signedIn()) return void (await post("government", { government: id }));
  if (!unlockedGovernments(myProgression()).includes(id)) {
    throw new Error("locked");
  }
  writeGuest({ ...state.guest, g: id });
}

// ---------------------------------------------------------------- rewards --

const paidGames = new Set<string>();

/**
 * A game this client played has ended. Multiplayer games pay accounts on the
 * server; singleplayer games are reported to it; guests pay themselves.
 * Returns the coins and RP earned, for the win screen.
 */
export async function reportGameEnd(r: {
  gameID: string;
  multiplayer: boolean;
  difficulty: Difficulty;
  won: boolean;
  researchPoints: number;
  unlockAll: boolean;
}): Promise<{ coins: number; rp: number }> {
  if (r.unlockAll || paidGames.has(r.gameID)) return { coins: 0, rp: 0 };
  paidGames.add(r.gameID);
  const earned = {
    coins: r.won ? coinsForWin(r.difficulty, r.multiplayer) : 0,
    rp: Math.min(MAX_RP_PER_MATCH, Math.max(0, Math.floor(r.researchPoints))),
  };
  if (signedIn()) {
    if (r.multiplayer) {
      // The server pays out when it settles the winner; refresh after.
      setTimeout(() => void loadProgress(true), 3000);
    } else {
      await post("solo-result", {
        gameID: r.gameID,
        difficulty: r.difficulty,
        won: r.won,
        researchPoints: earned.rp,
        unlockAll: r.unlockAll,
      }).catch(() => null);
    }
    return earned;
  }
  const g = readGuest();
  writeGuest({ ...g, c: g.c + earned.coins, r: g.r + earned.rp });
  return earned;
}
