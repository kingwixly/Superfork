import {
  BUFF_IDS,
  BUFFS,
  buffCost,
  canUnlockNode,
  COINS_PER_RP,
  GovernmentId,
  MAX_RP_PER_MATCH,
  Progression,
  TREE_BY_ID,
  unlockedGovernments,
} from "@openfront/engine-api/game/Progression";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";

/**
 * Superfork accounts: username + password, coins, research points, owned
 * cosmetics and research-tree progress. One JSON file on the gate's Docker
 * volume (no database), written atomically on every change.
 *
 * Passwords are scrypt-hashed. Session tokens are never stored: the file is
 * keyed by sha256(token), like the gate's own sessions.
 */

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "sf_session";
export const SESSION_DAYS = 90;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 6;
export const MAX_PASSWORD = 200;
/** Remembered game ids per account, so one game never pays twice. */
const REWARDED_GAMES_KEPT = 200;

export interface AccountRecord {
  id: string;
  username: string;
  /** Lowercase username, for case-insensitive uniqueness. */
  key: string;
  pass: string;
  createdAt: number;
  coins: number;
  rp: number;
  /** Cosmetic flares owned ("pattern:name:palette", "crown:name", ...). */
  owned: string[];
  /** Unlocked research tree nodes. */
  nodes: string[];
  /** Buff levels, parallel to BUFF_IDS. */
  buffs: number[];
  /** Government chosen to start matches with. */
  government: GovernmentId;
  rewardedGames: string[];
}

interface SessionRecord {
  accountId: string;
  expiresAt: number;
}

interface AccountFile {
  version: 1;
  accounts: Record<string, AccountRecord>;
  sessions: Record<string, SessionRecord>;
}

/** What the client sees of an account. */
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

export class AccountError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AccountStore {
  private data: AccountFile = { version: 1, accounts: {}, sessions: {} };

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (raw?.version === 1) this.data = raw as AccountFile;
    } catch {
      // No file yet: start empty.
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  // ------------------------------------------------------------ sign in --

  async register(username: string, password: string): Promise<string> {
    if (!USERNAME_RE.test(username)) throw new AccountError("bad_username");
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw new AccountError("bad_password");
    }
    const key = username.toLowerCase();
    if (Object.values(this.data.accounts).some((a) => a.key === key)) {
      throw new AccountError("username_taken", 409);
    }
    const id = crypto.randomBytes(12).toString("base64url");
    this.data.accounts[id] = {
      id,
      username,
      key,
      pass: await hashPassword(password),
      createdAt: this.now(),
      coins: 0,
      rp: 0,
      owned: [],
      nodes: [],
      buffs: [],
      government: "standard",
      rewardedGames: [],
    };
    this.save();
    return this.newSession(id);
  }

  async login(username: string, password: string): Promise<string> {
    const key = username.toLowerCase();
    const account = Object.values(this.data.accounts).find(
      (a) => a.key === key,
    );
    // Same work whether or not the account exists.
    const ok = await verifyPassword(
      password,
      account?.pass ?? "scrypt:AAAAAAAAAAAAAAAAAAAAAA:AAAA",
    );
    if (account === undefined || !ok) {
      throw new AccountError("bad_login", 401);
    }
    return this.newSession(account.id);
  }

  private newSession(accountId: string): string {
    const token = crypto.randomBytes(32).toString("base64url");
    this.pruneSessions();
    this.data.sessions[hashToken(token)] = {
      accountId,
      expiresAt: this.now() + SESSION_DAYS * 86_400_000,
    };
    this.save();
    return token;
  }

  private pruneSessions(): void {
    const now = this.now();
    for (const [h, s] of Object.entries(this.data.sessions)) {
      if (s.expiresAt < now) delete this.data.sessions[h];
    }
  }

  logout(token: string): void {
    delete this.data.sessions[hashToken(token)];
    this.save();
  }

  bySession(token: string | undefined): AccountRecord | null {
    if (token === undefined || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const s = this.data.sessions[hashToken(token)];
    if (s === undefined || s.expiresAt < this.now()) return null;
    return this.data.accounts[s.accountId] ?? null;
  }

  byId(id: string): AccountRecord | null {
    return this.data.accounts[id] ?? null;
  }

  profile(a: AccountRecord, admin: boolean): AccountProfile {
    return {
      username: a.username,
      coins: a.coins,
      rp: a.rp,
      owned: [...a.owned],
      nodes: [...a.nodes],
      buffs: [...a.buffs],
      government: a.government,
      admin,
    };
  }

  /** The progression an account brings into a game. */
  progression(a: AccountRecord, admin: boolean): Progression {
    return {
      ...(admin ? { bypass: true } : {}),
      nodes: [...a.nodes],
      buffs: [...a.buffs],
      government: a.government,
    };
  }

  // ------------------------------------------------------------ spending --

  /** Buy a cosmetic flare for `price` coins. */
  buyCosmetic(a: AccountRecord, flare: string, price: number): void {
    if (a.owned.includes(flare)) throw new AccountError("already_owned");
    if (a.coins < price) throw new AccountError("not_enough_coins");
    a.coins -= price;
    a.owned.push(flare);
    this.save();
  }

  buyResearch(a: AccountRecord, rp: number): void {
    if (!Number.isInteger(rp) || rp <= 0 || rp > 100_000) {
      throw new AccountError("bad_amount");
    }
    const cost = rp * COINS_PER_RP;
    if (a.coins < cost) throw new AccountError("not_enough_coins");
    a.coins -= cost;
    a.rp += rp;
    this.save();
  }

  unlock(a: AccountRecord, nodeId: string, free: boolean): void {
    const node = TREE_BY_ID.get(nodeId);
    if (node === undefined) throw new AccountError("no_such_node");
    if (!canUnlockNode(nodeId, a.nodes)) {
      throw new AccountError(
        a.nodes.includes(nodeId) ? "already_unlocked" : "locked",
      );
    }
    if (!free) {
      if (a.rp < node.cost) throw new AccountError("not_enough_rp");
      a.rp -= node.cost;
    }
    a.nodes.push(nodeId);
    this.save();
  }

  buff(a: AccountRecord, buffId: string, free: boolean): void {
    const i = BUFF_IDS.indexOf(buffId as (typeof BUFF_IDS)[number]);
    if (i < 0) throw new AccountError("no_such_buff");
    while (a.buffs.length < BUFF_IDS.length) a.buffs.push(0);
    const level = a.buffs[i];
    if (level >= BUFFS[BUFF_IDS[i]].maxLevel) {
      throw new AccountError("max_level");
    }
    const cost = buffCost(level);
    if (!free) {
      if (a.rp < cost) throw new AccountError("not_enough_rp");
      a.rp -= cost;
    }
    a.buffs[i] = level + 1;
    this.save();
  }

  setGovernment(a: AccountRecord, id: GovernmentId, admin: boolean): void {
    if (!unlockedGovernments(this.progression(a, admin)).includes(id)) {
      throw new AccountError("locked");
    }
    a.government = id;
    this.save();
  }

  // ------------------------------------------------------------- rewards --

  /**
   * Pay out a finished game. Each game pays an account once; research
   * points are capped per match.
   */
  reward(a: AccountRecord, gameID: string, coins: number, rp: number): boolean {
    if (a.rewardedGames.includes(gameID)) return false;
    a.rewardedGames.push(gameID);
    if (a.rewardedGames.length > REWARDED_GAMES_KEPT) {
      a.rewardedGames.splice(0, a.rewardedGames.length - REWARDED_GAMES_KEPT);
    }
    a.coins += Math.max(0, Math.floor(coins));
    a.rp += Math.min(MAX_RP_PER_MATCH, Math.max(0, Math.floor(rp)));
    this.save();
    return true;
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || salt === undefined || hash === undefined) {
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), 32);
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}
