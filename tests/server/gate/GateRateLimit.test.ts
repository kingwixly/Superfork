// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  AdminLoginLimiter,
  DEFAULT_ADMIN_LOGIN_LIMITS,
  SlidingWindowLimiter,
} from "../../../src/server/gate/GateRateLimit";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("SlidingWindowLimiter", () => {
  test("allows up to the limit then blocks until the window slides", () => {
    const c = clock();
    const l = new SlidingWindowLimiter(3, 1000, c.now);
    expect(l.hit("a")).toBe(true);
    expect(l.hit("a")).toBe(true);
    expect(l.hit("a")).toBe(true);
    expect(l.hit("a")).toBe(false);
    expect(l.retryAfterMs("a")).toBe(1000);
    // Other keys are independent.
    expect(l.hit("b")).toBe(true);
    c.advance(1001);
    expect(l.retryAfterMs("a")).toBe(0);
    expect(l.hit("a")).toBe(true);
  });
});

describe("AdminLoginLimiter", () => {
  test("locks an IP out after 5 wrong tries, with a growing lockout", () => {
    const c = clock();
    const l = new AdminLoginLimiter(
      {
        ...DEFAULT_ADMIN_LOGIN_LIMITS,
        globalPerHour: 1000,
        globalPerDay: 1000,
      },
      c.now,
    );
    for (let i = 0; i < 5; i++) {
      expect(l.begin("1.1.1.1").allowed).toBe(true);
    }
    const blocked = l.begin("1.1.1.1");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toBe("ip_locked");
      expect(blocked.retryAfterMs).toBe(60_000);
    }
    // A different IP is unaffected.
    expect(l.begin("2.2.2.2").allowed).toBe(true);

    // After the first lockout, five more failures earn a doubled lockout.
    c.advance(60_001);
    for (let i = 0; i < 5; i++) {
      expect(l.begin("1.1.1.1").allowed).toBe(true);
    }
    const second = l.begin("1.1.1.1");
    expect(second.allowed).toBe(false);
    if (!second.allowed) expect(second.retryAfterMs).toBe(120_000);
  });

  test("lockout is capped at the maximum", () => {
    const c = clock();
    const l = new AdminLoginLimiter(
      {
        ...DEFAULT_ADMIN_LOGIN_LIMITS,
        perIpFailures: 1,
        baseLockoutMs: 1000,
        maxLockoutMs: 4000,
        globalPerHour: 1e6,
        globalPerDay: 1e6,
      },
      c.now,
    );
    const lockouts: number[] = [];
    for (let i = 0; i < 6; i++) {
      expect(l.begin("ip").allowed).toBe(true);
      const r = l.begin("ip");
      if (!r.allowed) lockouts.push(r.retryAfterMs);
      c.advance(r.allowed ? 0 : r.retryAfterMs);
    }
    expect(lockouts).toEqual([1000, 2000, 4000, 4000, 4000, 4000]);
  });

  test("charges attempts up front so parallel guesses can't exceed the limit", () => {
    const l = new AdminLoginLimiter(DEFAULT_ADMIN_LOGIN_LIMITS, () => 0);
    // Six begin() calls without any result being reported in between, as
    // with a burst of concurrent requests.
    const results = Array.from({ length: 6 }, () => l.begin("9.9.9.9"));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  test("a correct code refunds the attempt and clears the IP", () => {
    const l = new AdminLoginLimiter(DEFAULT_ADMIN_LOGIN_LIMITS, () => 0);
    for (let i = 0; i < 4; i++) l.begin("ip");
    expect(l.remaining("ip")).toBe(1);
    l.begin("ip"); // fifth attempt would lock...
    // ...but this one was right.
    l.succeed("ip");
    expect(l.remaining("ip")).toBe(5);
    expect(l.begin("ip").allowed).toBe(true);
  });

  test("global cap blocks every IP once reached", () => {
    const c = clock();
    const l = new AdminLoginLimiter(
      { ...DEFAULT_ADMIN_LOGIN_LIMITS, globalPerHour: 3, globalPerDay: 5 },
      c.now,
    );
    expect(l.begin("a").allowed).toBe(true);
    expect(l.begin("b").allowed).toBe(true);
    expect(l.begin("c").allowed).toBe(true);
    const r = l.begin("d");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("global_cap");

    // Next hour: two more fit under the daily cap, then it's closed.
    c.advance(60 * 60_000 + 1);
    expect(l.begin("e").allowed).toBe(true);
    expect(l.begin("f").allowed).toBe(true);
    const day = l.begin("g");
    expect(day.allowed).toBe(false);
    if (!day.allowed) expect(day.reason).toBe("global_cap");

    c.advance(24 * 60 * 60_000);
    expect(l.begin("h").allowed).toBe(true);
  });
});
