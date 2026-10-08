import crypto from "crypto";
import { parseAdminHash, ParsedAdminHash } from "./gate/AdminCode";

/**
 * UCI developer-tool authentication.
 *
 * The password is never in the repo or the client bundle. The server holds
 * only UCI_PASSWORD_HASH, a salted scrypt hash in the same
 * `scrypt:N:r:p:salt:hash` form as ADMIN_CODE_HASH (generate it with
 * src/server/GenerateUciHash.ts). Without it, UCI is switched off.
 *
 * Flow:
 *  1. The client POSTs the password to /api/uci/verify. A correct one gets a
 *     short-lived session token: an expiry plus an HMAC keyed off the hash,
 *     so every worker can check it without shared state.
 *  2. In multiplayer the client sends that token over its game socket
 *     (`uci_auth`, never relayed to other players). The game server marks
 *     the connection as a UCI admin and only then relays its `uci` intents.
 *  3. Singleplayer runs locally, so the HTTP check is the only gate there,
 *     which is fine: it can only affect the player's own game.
 */

export const UCI_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PASSWORD_LENGTH = 128;
const DEFAULT_N = 1 << 15;
const KEY_LEN = 32;

/** Failed guesses allowed per IP before a cool-down. */
export const UCI_MAX_FAILURES = 5;
export const UCI_LOCKOUT_MS = 15 * 60 * 1000;

function scrypt(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  keyLen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLen,
      { N, r, p, maxmem: 256 * N * r + 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Hash a password into the UCI_PASSWORD_HASH format. */
export async function hashUciPassword(password: string): Promise<string> {
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("password must be 1-128 characters");
  }
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, DEFAULT_N, 8, 1, KEY_LEN);
  return [
    "scrypt",
    DEFAULT_N,
    8,
    1,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

export class UciAuth {
  private readonly parsed: ParsedAdminHash;
  private readonly tokenKey: Buffer;
  private readonly failures = new Map<string, { count: number; at: number }>();

  /** Throws if the hash is malformed; callers treat that as "UCI off". */
  constructor(
    hashValue: string,
    private readonly now: () => number = Date.now,
  ) {
    this.parsed = parseAdminHash(hashValue);
    this.tokenKey = crypto
      .createHash("sha256")
      .update(`uci-token:${hashValue.trim()}`)
      .digest();
  }

  /** From the environment, or null when UCI is not configured. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): UciAuth | null {
    const value = env.UCI_PASSWORD_HASH;
    if (value === undefined || value.trim() === "") return null;
    try {
      return new UciAuth(value);
    } catch {
      return null;
    }
  }

  /** Whether `ip` has used up its guesses for now. */
  isLockedOut(ip: string): boolean {
    const f = this.failures.get(ip);
    if (f === undefined) return false;
    if (this.now() - f.at > UCI_LOCKOUT_MS) {
      this.failures.delete(ip);
      return false;
    }
    return f.count >= UCI_MAX_FAILURES;
  }

  /**
   * Check a password; returns a session token, or null. Every call runs a
   * full scrypt, so timing does not reveal anything about the input.
   */
  async verifyPassword(password: unknown, ip: string): Promise<string | null> {
    if (this.isLockedOut(ip)) return null;
    const ok =
      typeof password === "string" &&
      password.length > 0 &&
      password.length <= MAX_PASSWORD_LENGTH;
    const candidate = await scrypt(
      ok ? password : "not-a-password",
      this.parsed.salt,
      this.parsed.N,
      this.parsed.r,
      this.parsed.p,
      this.parsed.hash.length,
    );
    const match = crypto.timingSafeEqual(candidate, this.parsed.hash) && ok;
    if (!match) {
      const f = this.failures.get(ip);
      this.failures.set(ip, { count: (f?.count ?? 0) + 1, at: this.now() });
      return null;
    }
    this.failures.delete(ip);
    return this.mintToken();
  }

  mintToken(): string {
    const expires = this.now() + UCI_TOKEN_TTL_MS;
    return `${expires}.${this.sign(expires)}`;
  }

  verifyToken(token: unknown): boolean {
    if (typeof token !== "string") return false;
    const dot = token.indexOf(".");
    if (dot <= 0) return false;
    const expires = Number(token.slice(0, dot));
    if (!Number.isSafeInteger(expires) || expires < this.now()) return false;
    const given = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(this.sign(expires));
    return (
      given.length === expected.length &&
      crypto.timingSafeEqual(given, expected)
    );
  }

  private sign(expires: number): string {
    return crypto
      .createHmac("sha256", this.tokenKey)
      .update(`uci:${expires}`)
      .digest("base64url");
  }
}

/** Process-wide instance, read from the environment once. */
let cached: UciAuth | null | undefined;
export function uciAuth(): UciAuth | null {
  if (cached === undefined) cached = UciAuth.fromEnv();
  return cached;
}

/** Tests only: re-read the environment on next use. */
export function resetUciAuthForTests(): void {
  cached = undefined;
}
