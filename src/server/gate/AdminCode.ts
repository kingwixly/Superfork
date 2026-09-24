import crypto from "crypto";

// Admin code hashing for the access gate.
//
// The admin code is a 6-digit number. It is never stored in the repo or in
// plain text on the server: the server only sees ADMIN_CODE_HASH, a salted
// scrypt hash in the form
//
//   scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>
//
// The format deliberately avoids "$" so the value can be pasted into a
// docker-compose.yml environment block without compose trying to
// interpolate it.
//
// A 6-digit space is small (10^6), so the hash alone does not protect the
// code if ADMIN_CODE_HASH leaks: the real defence is the attempt limiter in
// GateRateLimit.ts. The hash just keeps the code out of `docker inspect`,
// compose files and logs.

const PREFIX = "scrypt";
const DEFAULT_N = 1 << 15;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

export const ADMIN_CODE_PATTERN = /^\d{6}$/;

export interface ParsedAdminHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function scryptAsync(
  code: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  keyLen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      code,
      salt,
      keyLen,
      // 128 * N * r bytes is the scrypt working set; leave headroom.
      { N, r, p, maxmem: 256 * N * r + 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Cryptographically random 6-digit code, zero-padded ("000000".."999999"). */
export function generateAdminCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function hashAdminCode(
  code: string,
  opts: { N?: number; r?: number; p?: number } = {},
): Promise<string> {
  if (!ADMIN_CODE_PATTERN.test(code)) {
    throw new Error("admin code must be exactly 6 digits");
  }
  const N = opts.N ?? DEFAULT_N;
  const r = opts.r ?? DEFAULT_R;
  const p = opts.p ?? DEFAULT_P;
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = await scryptAsync(code, salt, N, r, p, KEY_LEN);
  return [
    PREFIX,
    N,
    r,
    p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

export function parseAdminHash(value: string | undefined): ParsedAdminHash {
  if (!value) throw new Error("ADMIN_CODE_HASH is empty");
  const parts = value.trim().split(":");
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    throw new Error("ADMIN_CODE_HASH is not in scrypt:N:r:p:salt:hash form");
  }
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (
    !Number.isInteger(N) ||
    N < 2 ||
    (N & (N - 1)) !== 0 ||
    N > 1 << 20 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 32 ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > 16
  ) {
    throw new Error("ADMIN_CODE_HASH has invalid scrypt parameters");
  }
  const salt = Buffer.from(saltRaw, "base64url");
  const hash = Buffer.from(hashRaw, "base64url");
  if (salt.length < 8 || hash.length < 16) {
    throw new Error("ADMIN_CODE_HASH salt/hash too short");
  }
  return { N, r, p, salt, hash };
}

/**
 * Constant-time check of a submitted code against a parsed hash. Malformed
 * input still runs a full scrypt so response time doesn't reveal whether the
 * input was well-formed.
 */
export async function verifyAdminCode(
  code: unknown,
  parsed: ParsedAdminHash,
): Promise<boolean> {
  const wellFormed = typeof code === "string" && ADMIN_CODE_PATTERN.test(code);
  const candidate = await scryptAsync(
    wellFormed ? code : "not-a-code",
    parsed.salt,
    parsed.N,
    parsed.r,
    parsed.p,
    parsed.hash.length,
  );
  const match = crypto.timingSafeEqual(candidate, parsed.hash);
  return wellFormed && match;
}
