// @vitest-environment node
import express from "express";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  generateAdminCode,
  hashAdminCode,
  parseAdminHash,
  verifyAdminCode,
} from "../../../src/server/gate/AdminCode";
import {
  ADMIN_COOKIE,
  DEVICE_COOKIE,
  createGate,
  parseCookies,
  type GateOptions,
} from "../../../src/server/gate/Gate";
import { GateStore } from "../../../src/server/gate/GateStore";

const CODE = "482913";
// Cheap scrypt parameters keep the suite fast; production uses N=2^15.
const hashPromise = hashAdminCode(CODE, { N: 1024 });

const quietLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

interface Res {
  status: number;
  body: string;
  json: any;
  setCookies: string[];
  headers: http.IncomingHttpHeaders;
}

class Browser {
  jar = new Map<string, string>();
  constructor(
    private readonly base: string,
    readonly ip = "10.0.0.1",
  ) {}

  async req(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Res> {
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const h: Record<string, string> = {
      "x-forwarded-for": this.ip,
      "user-agent": "TestBrowser/1.0",
      ...headers,
    };
    if (cookie) h.cookie = cookie;
    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      h["content-type"] = "application/json";
      h["x-requested-with"] ??= "superfront-gate";
    }
    const u = new URL(url, this.base);
    return new Promise((resolve, reject) => {
      const r = http.request(u, { method, headers: h }, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const setCookies = ([] as string[]).concat(
            res.headers["set-cookie"] ?? [],
          );
          for (const sc of setCookies) {
            const [kv, ...attrs] = sc.split(";");
            const i = kv.indexOf("=");
            const k = kv.slice(0, i).trim();
            const v = kv.slice(i + 1).trim();
            if (attrs.some((a) => a.trim() === "Max-Age=0") || v === "") {
              this.jar.delete(k);
            } else {
              this.jar.set(k, v);
            }
          }
          let json: any;
          try {
            json = JSON.parse(data);
          } catch {
            json = undefined;
          }
          resolve({
            status: res.statusCode ?? 0,
            body: data,
            json,
            setCookies,
            headers: res.headers,
          });
        });
      });
      r.on("error", reject);
      if (payload) r.write(payload);
      r.end();
    });
  }

  check(originalUri = "/w0/api/game/abc") {
    return this.req("GET", "/__gate/check", undefined, {
      "x-original-uri": originalUri,
    });
  }
}

describe("access gate", () => {
  let dir: string;
  let server: http.Server;
  let base: string;
  let store: GateStore;
  let now: number;

  async function start(extra: Partial<GateOptions> = {}) {
    store = new GateStore({
      file: path.join(dir, "requests.json"),
      log: quietLog,
      now: () => now,
    });
    const gate = createGate({
      store,
      adminCodeHash: await hashPromise,
      secureCookies: true,
      now: () => now,
      log: quietLog,
      ...extra,
    });
    const app = express();
    app.set("trust proxy", 1);
    app.use("/__gate", gate.router);
    server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-test-"));
    now = 1_700_000_000_000;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server?.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function adminLogin(ip = "10.9.9.9"): Promise<Browser> {
    const admin = new Browser(base, ip);
    const r = await admin.req("POST", "/__gate/admin/login", { code: CODE });
    expect(r.status).toBe(200);
    return admin;
  }

  describe("middleware (/__gate/check)", () => {
    test("blocks a browser with no cookies", async () => {
      await start();
      const b = new Browser(base);
      expect((await b.check()).status).toBe(401);
    });

    test("blocks forged and unknown device cookies", async () => {
      await start();
      const b = new Browser(base);
      b.jar.set(DEVICE_COOKIE, "not-a-token");
      expect((await b.check()).status).toBe(401);
      b.jar.set(DEVICE_COOKIE, "A".repeat(43));
      expect((await b.check()).status).toBe(401);
    });

    test("blocks a pending device", async () => {
      await start();
      const b = new Browser(base);
      await b.req("GET", "/__gate/status");
      await b.req("POST", "/__gate/request", { note: "Sam" });
      expect((await b.check()).status).toBe(401);
    });

    test("passes everything when disabled", async () => {
      await start({ enabled: false });
      expect((await new Browser(base).check()).status).toBe(204);
    });

    test("responses are never cacheable", async () => {
      await start();
      const r = await new Browser(base).check();
      expect(r.headers["cache-control"]).toContain("no-store");
    });
  });

  describe("gate page and device cookie", () => {
    test("first visit mints an opaque long-lived device cookie", async () => {
      await start();
      const b = new Browser(base);
      const r = await b.req("GET", "/__gate/page");
      expect(r.status).toBe(403);
      expect(r.body).toContain("Request access");
      expect(r.headers["content-security-policy"]).toContain("nonce-");
      const sc = r.setCookies.find((c) => c.startsWith(`${DEVICE_COOKIE}=`));
      expect(sc).toBeDefined();
      expect(sc).toMatch(/HttpOnly/);
      expect(sc).toMatch(/Secure/);
      expect(sc).toMatch(/SameSite=Lax/);
      expect(sc).toMatch(/Path=\//);
      const maxAge = Number(/Max-Age=(\d+)/.exec(sc!)![1]);
      expect(maxAge).toBeGreaterThan(9 * 365 * 24 * 3600);
      expect(b.jar.get(DEVICE_COOKIE)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    test("the same cookie is kept on later visits", async () => {
      await start();
      const b = new Browser(base);
      await b.req("GET", "/__gate/page");
      const first = b.jar.get(DEVICE_COOKIE);
      const r = await b.req("GET", "/__gate/page");
      expect(r.setCookies).toHaveLength(0);
      expect(b.jar.get(DEVICE_COOKIE)).toBe(first);
    });

    test("insecure cookies only when explicitly configured", async () => {
      await start({ secureCookies: false });
      const r = await new Browser(base).req("GET", "/__gate/page");
      expect(r.setCookies[0]).not.toMatch(/Secure/);
    });
  });

  describe("approval flow", () => {
    test("request -> pending -> approve -> allowed, and it persists", async () => {
      await start();
      const player = new Browser(base, "10.0.0.5");
      expect((await player.req("GET", "/__gate/status")).json).toEqual({
        status: "none",
        admin: false,
      });

      const req = await player.req("POST", "/__gate/request", {
        note: "  Sam\u0000 from   Discord  ",
      });
      expect(req.status).toBe(200);
      expect(req.json.status).toBe("pending");

      const admin = await adminLogin();
      const list = await admin.req("GET", "/__gate/admin/requests");
      expect(list.status).toBe(200);
      expect(list.json.requests).toHaveLength(1);
      const rec = list.json.requests[0];
      expect(rec.status).toBe("pending");
      expect(rec.note).toBe("Sam from Discord");
      expect(rec.userAgent).toBe("TestBrowser/1.0");
      // The device token itself is never exposed or stored.
      const token = player.jar.get(DEVICE_COOKIE)!;
      expect(JSON.stringify(list.json)).not.toContain(token);
      expect(fs.readFileSync(store.file, "utf8")).not.toContain(token);

      const ok = await admin.req(
        "POST",
        `/__gate/admin/requests/${rec.id}/approve`,
        {},
      );
      expect(ok.status).toBe(200);

      expect((await player.req("GET", "/__gate/status")).json.status).toBe(
        "approved",
      );
      expect((await player.check()).status).toBe(204);

      // Survives a restart (new store reading the same file).
      await new Promise<void>((r) => server.close(() => r()));
      await start();
      const again = new Browser(base, "10.0.0.5");
      again.jar = player.jar;
      expect((await again.check()).status).toBe(204);
    });

    test("approved app-shell loads refresh the device cookie", async () => {
      await start();
      const player = new Browser(base);
      await player.req("POST", "/__gate/request", {}); // no cookie yet
      await player.req("GET", "/__gate/status");
      await player.req("POST", "/__gate/request", {});
      const admin = await adminLogin();
      const id = (await admin.req("GET", "/__gate/admin/requests")).json
        .requests[0].id;
      await admin.req("POST", `/__gate/admin/requests/${id}/approve`, {});

      const shell = await player.check("/");
      expect(shell.status).toBe(204);
      expect(shell.setCookies[0]).toMatch(new RegExp(`^${DEVICE_COOKIE}=`));
      const asset = await player.check("/assets/index.js");
      expect(asset.setCookies).toHaveLength(0);
    });

    test("request without a cookie asks the browser to enable cookies", async () => {
      await start();
      const r = await new Browser(base).req("POST", "/__gate/request", {});
      expect(r.status).toBe(400);
    });

    test("deny and revoke both block; a denied device can't requeue itself", async () => {
      await start();
      const a = new Browser(base, "10.0.0.1");
      const b = new Browser(base, "10.0.0.2");
      for (const p of [a, b]) {
        await p.req("GET", "/__gate/status");
        await p.req("POST", "/__gate/request", { note: p.ip });
      }
      const admin = await adminLogin();
      const reqs = (await admin.req("GET", "/__gate/admin/requests")).json
        .requests as { id: string; note: string }[];
      const idA = reqs.find((r) => r.note === "10.0.0.1")!.id;
      const idB = reqs.find((r) => r.note === "10.0.0.2")!.id;

      await admin.req("POST", `/__gate/admin/requests/${idA}/deny`, {});
      expect((await a.check()).status).toBe(401);
      const retry = await a.req("POST", "/__gate/request", { note: "pls" });
      expect(retry.json.status).toBe("denied");

      await admin.req("POST", `/__gate/admin/requests/${idB}/approve`, {});
      expect((await b.check()).status).toBe(204);
      await admin.req("POST", `/__gate/admin/requests/${idB}/revoke`, {});
      expect((await b.check()).status).toBe(401);
      const after = (await admin.req("GET", "/__gate/admin/requests")).json
        .requests as { id: string; status: string; revokedAt?: number }[];
      expect(after.find((r) => r.id === idB)).toMatchObject({
        status: "denied",
        revokedAt: now,
      });
    });

    test("admin actions need an admin session and the CSRF header", async () => {
      await start();
      const p = new Browser(base);
      await p.req("GET", "/__gate/status");
      await p.req("POST", "/__gate/request", {});
      const id = store.listDevices()[0].id;

      expect(
        (await p.req("POST", `/__gate/admin/requests/${id}/approve`, {}))
          .status,
      ).toBe(401);
      expect((await p.req("GET", "/__gate/admin/requests")).status).toBe(401);
      const page = await p.req("GET", "/__gate/admin");
      expect(page.status).toBe(302);

      const admin = await adminLogin();
      const noHeader = await admin.req(
        "POST",
        `/__gate/admin/requests/${id}/approve`,
        {},
        { "x-requested-with": "" },
      );
      expect(noHeader.status).toBe(403);
      expect(store.listDevices()[0].status).toBe("pending");
    });
  });

  describe("admin login", () => {
    test("correct code sets a strict admin cookie that passes the gate", async () => {
      await start();
      const admin = new Browser(base);
      expect((await admin.check()).status).toBe(401);
      const r = await admin.req("POST", "/__gate/admin/login", { code: CODE });
      expect(r.status).toBe(200);
      const sc = r.setCookies.find((c) => c.startsWith(`${ADMIN_COOKIE}=`))!;
      expect(sc).toMatch(/HttpOnly/);
      expect(sc).toMatch(/SameSite=Strict/);
      expect(sc).toMatch(/Secure/);
      expect((await admin.check()).status).toBe(204);
      expect((await admin.req("GET", "/__gate/admin")).status).toBe(200);
      expect((await admin.req("GET", "/__gate/status")).json.admin).toBe(true);

      await admin.req("POST", "/__gate/admin/logout", {});
      expect((await admin.check()).status).toBe(401);
    });

    test("admin session survives a restart", async () => {
      await start();
      const admin = await adminLogin();
      await new Promise<void>((r) => server.close(() => r()));
      await start();
      const again = new Browser(base);
      again.jar = admin.jar;
      expect((await again.check()).status).toBe(204);
    });

    test("wrong codes lock the IP out after 5 tries, even for the right code", async () => {
      await start();
      const attacker = new Browser(base, "6.6.6.6");
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push(
          (
            await attacker.req("POST", "/__gate/admin/login", {
              code: "000000",
            })
          ).status,
        );
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401]);
      const locked = await attacker.req("POST", "/__gate/admin/login", {
        code: CODE,
      });
      expect(locked.status).toBe(429);
      expect(locked.headers["retry-after"]).toBe("60");
      expect(attacker.jar.has(ADMIN_COOKIE)).toBe(false);

      // Another IP can still log in.
      await adminLogin("7.7.7.7");

      // After the lockout expires the right code works again.
      now += 61_000;
      const ok = await attacker.req("POST", "/__gate/admin/login", {
        code: CODE,
      });
      expect(ok.status).toBe(200);
    });

    test("global cap stops distributed guessing", async () => {
      await start({
        loginLimits: {
          perIpFailures: 5,
          baseLockoutMs: 60_000,
          maxLockoutMs: 86_400_000,
          ipMemoryMs: 86_400_000,
          globalPerHour: 3,
          globalPerDay: 10,
        },
      });
      for (let i = 0; i < 3; i++) {
        const r = await new Browser(base, `5.5.5.${i}`).req(
          "POST",
          "/__gate/admin/login",
          { code: "111111" },
        );
        expect(r.status).toBe(401);
      }
      const r = await new Browser(base, "5.5.5.99").req(
        "POST",
        "/__gate/admin/login",
        { code: CODE },
      );
      expect(r.status).toBe(429);
    });

    test("malformed codes count as failures", async () => {
      await start();
      const b = new Browser(base, "4.4.4.4");
      for (const code of ["", "12345", "1234567", "abcdef", 123456, null]) {
        const r = await b.req("POST", "/__gate/admin/login", { code });
        expect([401, 429]).toContain(r.status);
      }
      expect(b.jar.has(ADMIN_COOKIE)).toBe(false);
    });

    test("login is disabled without a hash, and the site stays locked", async () => {
      await start({ adminCodeHash: undefined });
      const b = new Browser(base);
      const r = await b.req("POST", "/__gate/admin/login", { code: CODE });
      expect(r.status).toBe(503);
      expect((await b.check()).status).toBe(401);
    });
  });

  describe("request rate limits", () => {
    test("per IP: many fresh devices from one IP get cut off", async () => {
      await start({ requestsPerIpPerHour: 3 });
      const results: number[] = [];
      for (let i = 0; i < 5; i++) {
        const b = new Browser(base, "8.8.8.8");
        await b.req("GET", "/__gate/status");
        results.push((await b.req("POST", "/__gate/request", {})).status);
      }
      expect(results).toEqual([200, 200, 200, 429, 429]);
      expect(store.listDevices()).toHaveLength(3);

      // A different IP is fine, and the window slides.
      const other = new Browser(base, "8.8.4.4");
      await other.req("GET", "/__gate/status");
      expect((await other.req("POST", "/__gate/request", {})).status).toBe(200);
      now += 60 * 60_000 + 1;
      const later = new Browser(base, "8.8.8.8");
      await later.req("GET", "/__gate/status");
      expect((await later.req("POST", "/__gate/request", {})).status).toBe(200);
    });

    test("per device: one device can't spam re-submits across IPs", async () => {
      await start({ requestsPerDevicePerHour: 2, requestsPerIpPerHour: 100 });
      const b = new Browser(base, "1.2.3.4");
      await b.req("GET", "/__gate/status");
      const jar = b.jar;
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const hop = new Browser(base, `1.2.3.${10 + i}`);
        hop.jar = jar;
        statuses.push((await hop.req("POST", "/__gate/request", {})).status);
      }
      expect(statuses).toEqual([200, 200, 429, 429]);
    });

    test("pending queue has a hard cap", async () => {
      await start({ requestsPerIpPerHour: 100 });
      // Shrink the pending cap on the live store.
      (store as any).maxPending = 2;
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        const b = new Browser(base, `3.3.3.${i}`);
        await b.req("GET", "/__gate/status");
        statuses.push((await b.req("POST", "/__gate/request", {})).status);
      }
      expect(statuses).toEqual([200, 200, 503]);
    });

    test("status polling is rate limited per IP", async () => {
      await start({ statusPerIpPerMinute: 3 });
      const b = new Browser(base);
      const s: number[] = [];
      for (let i = 0; i < 4; i++)
        s.push((await b.req("GET", "/__gate/status")).status);
      expect(s).toEqual([200, 200, 200, 429]);
    });
  });
});

describe("GateStore", () => {
  test("a corrupt data file is set aside and the gate fails closed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-store-"));
    const file = path.join(dir, "requests.json");
    fs.writeFileSync(file, "{not json");
    const store = new GateStore({ file, log: quietLog });
    expect(store.listDevices()).toEqual([]);
    expect(fs.readdirSync(dir).some((f) => f.includes(".corrupt-"))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("AdminCode", () => {
  test("generates 6-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(generateAdminCode()).toMatch(/^\d{6}$/);
  });

  test("hash has no '$' (docker-compose interpolation) and verifies", async () => {
    const h = await hashPromise;
    expect(h).not.toContain("$");
    expect(h.startsWith("scrypt:1024:8:1:")).toBe(true);
    const parsed = parseAdminHash(h);
    expect(await verifyAdminCode(CODE, parsed)).toBe(true);
    expect(await verifyAdminCode("482914", parsed)).toBe(false);
    expect(await verifyAdminCode(482913, parsed)).toBe(false);
  });

  test("two hashes of the same code differ (salted)", async () => {
    const a = await hashAdminCode(CODE, { N: 1024 });
    const b = await hashAdminCode(CODE, { N: 1024 });
    expect(a).not.toBe(b);
  });

  test("rejects malformed hashes", () => {
    expect(() => parseAdminHash("")).toThrow();
    expect(() => parseAdminHash("bcrypt:x")).toThrow();
    expect(() =>
      parseAdminHash("scrypt:1000:8:1:aaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbb"),
    ).toThrow();
  });
});

describe("parseCookies", () => {
  test("parses and keeps the first value of duplicates", () => {
    const c = parseCookies("a=1; b=two%20words; a=3; bad; =x");
    expect(c.get("a")).toBe("1");
    expect(c.get("b")).toBe("two words");
    expect(c.size).toBe(2);
  });
});
