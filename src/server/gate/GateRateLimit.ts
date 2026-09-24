// In-memory rate limiting for the access gate.
//
// All state lives in the master process (the gate endpoints are only ever
// served by the master), so a plain Map is enough. Memory is bounded by
// pruning expired entries and by hard caps on the number of tracked keys.

export type Clock = () => number;

const MAX_TRACKED_KEYS = 50_000;

/**
 * Allows at most `limit` hits per key within a sliding `windowMs`.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastPrune = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: Clock = Date.now,
  ) {}

  /** Records a hit and returns true if it is within the limit. */
  hit(key: string): boolean {
    const t = this.now();
    this.prune(t);
    const cutoff = t - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((x) => x > cutoff);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    return true;
  }

  /** Milliseconds until `key` may hit again (0 if it may now). */
  retryAfterMs(key: string): number {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((x) => x > cutoff);
    if (list.length < this.limit) return 0;
    return Math.max(0, list[list.length - this.limit] + this.windowMs - t);
  }

  private prune(t: number): void {
    if (t - this.lastPrune < this.windowMs && this.hits.size < MAX_TRACKED_KEYS)
      return;
    this.lastPrune = t;
    const cutoff = t - this.windowMs;
    for (const [k, v] of this.hits) {
      if (v.every((x) => x <= cutoff)) this.hits.delete(k);
    }
    // Still too many keys (e.g. a flood from many IPs): drop the oldest.
    // Insertion order approximates age well enough here.
    while (this.hits.size >= MAX_TRACKED_KEYS) {
      const first = this.hits.keys().next().value;
      if (first === undefined) break;
      this.hits.delete(first);
    }
  }
}

export interface AdminLoginLimits {
  /** Wrong codes allowed per IP before a lockout starts. */
  perIpFailures: number;
  /** First lockout; doubles with each further lockout for the same IP. */
  baseLockoutMs: number;
  /** Lockouts never grow beyond this. */
  maxLockoutMs: number;
  /** A clean IP record is forgotten after this long without failures. */
  ipMemoryMs: number;
  /** Global cap: attempts from all IPs per hour. */
  globalPerHour: number;
  /** Global cap: attempts from all IPs per day. */
  globalPerDay: number;
}

export const DEFAULT_ADMIN_LOGIN_LIMITS: AdminLoginLimits = {
  perIpFailures: 5,
  baseLockoutMs: 60_000,
  maxLockoutMs: 24 * 60 * 60_000,
  ipMemoryMs: 24 * 60 * 60_000,
  globalPerHour: 20,
  globalPerDay: 100,
};

interface IpRecord {
  failures: number;
  lockouts: number;
  lockedUntil: number;
  lastFailure: number;
}

export type LoginGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "ip_locked" | "global_cap";
      retryAfterMs: number;
    };

/**
 * Brute-force protection for the 6-digit admin code.
 *
 * Every attempt is charged *before* the (slow, async) code check runs, so a
 * burst of parallel requests cannot slip past the limit while earlier
 * attempts are still being verified. A correct code refunds its own charge
 * and clears the IP's record.
 *
 * With the defaults an attacker gets at most 100 guesses a day across all IPs,
 * i.e. ~13 years on average to hit one code out of a million.
 */
export class AdminLoginLimiter {
  private readonly ips = new Map<string, IpRecord>();
  private global: number[] = [];

  constructor(
    private readonly limits: AdminLoginLimits = DEFAULT_ADMIN_LOGIN_LIMITS,
    private readonly now: Clock = Date.now,
  ) {}

  /** Checks limits and, if allowed, charges one attempt to `ip`. */
  begin(ip: string): LoginGateResult {
    const t = this.now();
    this.pruneGlobal(t);
    const rec = this.record(ip, t);

    if (rec.lockedUntil > t) {
      return {
        allowed: false,
        reason: "ip_locked",
        retryAfterMs: rec.lockedUntil - t,
      };
    }

    const hourAgo = t - 60 * 60_000;
    const inLastHour = this.global.filter((x) => x > hourAgo);
    if (inLastHour.length >= this.limits.globalPerHour) {
      return {
        allowed: false,
        reason: "global_cap",
        retryAfterMs: inLastHour[0] + 60 * 60_000 - t,
      };
    }
    if (this.global.length >= this.limits.globalPerDay) {
      return {
        allowed: false,
        reason: "global_cap",
        retryAfterMs: this.global[0] + 24 * 60 * 60_000 - t,
      };
    }

    // Charge the attempt as a failure up front.
    this.global.push(t);
    rec.failures += 1;
    rec.lastFailure = t;
    if (rec.failures >= this.limits.perIpFailures) {
      rec.lockouts += 1;
      rec.failures = 0;
      rec.lockedUntil =
        t +
        Math.min(
          this.limits.maxLockoutMs,
          this.limits.baseLockoutMs * 2 ** (rec.lockouts - 1),
        );
    }
    this.ips.set(ip, rec);
    return { allowed: true };
  }

  /** The attempt charged by `begin` was the correct code: refund it. */
  succeed(ip: string): void {
    this.ips.delete(ip);
    this.global.pop();
  }

  /** Remaining wrong tries before `ip` is locked out. */
  remaining(ip: string): number {
    const rec = this.ips.get(ip);
    if (!rec) return this.limits.perIpFailures;
    return Math.max(0, this.limits.perIpFailures - rec.failures);
  }

  private record(ip: string, t: number): IpRecord {
    const existing = this.ips.get(ip);
    if (
      existing &&
      existing.lockedUntil <= t &&
      t - existing.lastFailure > this.limits.ipMemoryMs
    ) {
      this.ips.delete(ip);
    } else if (existing) {
      return existing;
    }
    if (this.ips.size >= MAX_TRACKED_KEYS) {
      // Evict unlocked records first so an IP flood can't wipe lockouts.
      for (const [k, v] of this.ips) {
        if (v.lockedUntil <= t) {
          this.ips.delete(k);
          if (this.ips.size < MAX_TRACKED_KEYS) break;
        }
      }
    }
    return { failures: 0, lockouts: 0, lockedUntil: 0, lastFailure: t };
  }

  private pruneGlobal(t: number): void {
    const dayAgo = t - 24 * 60 * 60_000;
    if (this.global.length > 0 && this.global[0] <= dayAgo) {
      this.global = this.global.filter((x) => x > dayAgo);
    }
  }
}
