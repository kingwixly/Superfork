import crypto from "crypto";
import express, { type Request, type Response, type Router } from "express";
import {
  parseAdminHash,
  verifyAdminCode,
  type ParsedAdminHash,
} from "./AdminCode";
import { adminPageHtml, gatePageHtml } from "./GatePages";
import {
  AdminLoginLimiter,
  SlidingWindowLimiter,
  type AdminLoginLimits,
} from "./GateRateLimit";
import {
  GateCapacityError,
  GateStore,
  hashToken,
  isWellFormedToken,
  newToken,
  type DeviceRecord,
} from "./GateStore";

// Access gate.
//
// Enforcement happens in nginx (see nginx.conf): every request to the site —
// the app shell, JS/assets, /api, the master's /lobbies socket and every
// /wN/ worker route including its WebSocket — first makes an auth_request
// subrequest to GET /__gate/check here. 204 lets it through; 401 makes nginx
// serve the gate page instead. Only the /__gate/ endpoints below are reachable
// without passing the check.
//
// Allowed: a browser whose device cookie maps to an approved record, or one
// holding a valid admin session cookie.

export const DEVICE_COOKIE = "sf_device";
export const ADMIN_COOKIE = "sf_admin";

/** ~10 years. Chrome caps cookie lifetime at 400 days, so the cookie is also
 *  re-issued on each app-shell load (see /check). */
export const DEVICE_COOKIE_MAX_AGE_S = 10 * 365 * 24 * 60 * 60;
export const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "superfront-gate";

export interface GateLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}

export interface GateOptions {
  store: GateStore;
  /** Raw ADMIN_CODE_HASH value. Missing/invalid disables admin login. */
  adminCodeHash?: string;
  /** When false the check always passes (dev without nginx). */
  enabled?: boolean;
  /** Mark cookies Secure. Should be true everywhere but local dev. */
  secureCookies?: boolean;
  now?: () => number;
  loginLimits?: AdminLoginLimits;
  /** Access requests allowed per IP per hour. */
  requestsPerIpPerHour?: number;
  /** Access requests allowed per device per hour. */
  requestsPerDevicePerHour?: number;
  /** Status polls allowed per IP per minute. */
  statusPerIpPerMinute?: number;
  log?: GateLogger;
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || out.has(k)) continue;
    try {
      out.set(k, decodeURIComponent(v));
    } catch {
      out.set(k, v);
    }
  }
  return out;
}

function cookieHeader(
  name: string,
  value: string,
  maxAgeS: number,
  opts: { secure: boolean; sameSite: "Lax" | "Strict" },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeS}`,
    `Expires=${new Date(Date.now() + maxAgeS * 1000).toUTCString()}`,
    "HttpOnly",
    `SameSite=${opts.sameSite}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
}

function htmlHeaders(res: Response, nonce: string): void {
  noStore(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "img-src data:",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

/** Public view of a device record for the admin panel. */
function adminView(d: DeviceRecord) {
  return {
    id: d.id,
    status: d.status,
    note: d.note,
    userAgent: d.userAgent,
    requestedAt: d.requestedAt,
    updatedAt: d.updatedAt,
    decidedAt: d.decidedAt,
    revokedAt: d.revokedAt,
  };
}

export interface Gate {
  router: Router;
  /** For tests / diagnostics. */
  adminLoginEnabled: boolean;
}

export function createGate(opts: GateOptions): Gate {
  const store = opts.store;
  const enabled = opts.enabled ?? true;
  const secure = opts.secureCookies ?? true;
  const now = opts.now ?? Date.now;
  const log: GateLogger = opts.log ?? {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m, e) => console.error(m, e),
  };

  let adminHash: ParsedAdminHash | null = null;
  if (opts.adminCodeHash) {
    try {
      adminHash = parseAdminHash(opts.adminCodeHash);
    } catch (e) {
      log.error("gate: ADMIN_CODE_HASH is invalid; admin login disabled", e);
    }
  } else {
    log.warn("gate: ADMIN_CODE_HASH not set; admin login disabled");
  }
  if (!enabled) log.warn("gate: DISABLED (GATE_ENABLED=false) - site is open");

  const loginLimiter = new AdminLoginLimiter(opts.loginLimits, now);
  const reqPerIp = new SlidingWindowLimiter(
    opts.requestsPerIpPerHour ?? 5,
    60 * 60_000,
    now,
  );
  const reqPerDevice = new SlidingWindowLimiter(
    opts.requestsPerDevicePerHour ?? 5,
    60 * 60_000,
    now,
  );
  const statusPerIp = new SlidingWindowLimiter(
    opts.statusPerIpPerMinute ?? 60,
    60_000,
    now,
  );

  const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "?";

  const cookiesOf = (req: Request) => parseCookies(req.headers.cookie);

  const deviceToken = (req: Request): string | undefined => {
    const t = cookiesOf(req).get(DEVICE_COOKIE);
    return isWellFormedToken(t) ? t : undefined;
  };

  const isAdmin = (req: Request): boolean => {
    const t = cookiesOf(req).get(ADMIN_COOKIE);
    return isWellFormedToken(t) && store.isAdminSession(t);
  };

  const setDeviceCookie = (res: Response, token: string) =>
    res.append(
      "Set-Cookie",
      cookieHeader(DEVICE_COOKIE, token, DEVICE_COOKIE_MAX_AGE_S, {
        secure,
        sameSite: "Lax",
      }),
    );

  /** Returns the device token, minting and setting a cookie if needed. */
  const ensureDevice = (req: Request, res: Response): string => {
    const existing = deviceToken(req);
    if (existing) return existing;
    const token = newToken();
    setDeviceCookie(res, token);
    return token;
  };

  const statusFor = (req: Request, token: string | undefined) => {
    const rec = token ? store.getDevice(token) : undefined;
    return {
      status: rec?.status ?? "none",
      admin: isAdmin(req),
    };
  };

  /** Blocks cross-site POSTs: a custom header forces a CORS preflight,
   *  which we never approve. */
  const requireCsrfHeader = (req: Request, res: Response, next: () => void) => {
    if (req.get(CSRF_HEADER) !== CSRF_VALUE) {
      res.status(403).json({ error: "Missing request header." });
      return;
    }
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: () => void) => {
    if (!isAdmin(req)) {
      noStore(res);
      res.status(401).json({ error: "Admin login required." });
      return;
    }
    next();
  };

  const router = express.Router();
  router.use(express.json({ limit: "2kb" }));

  // ---- nginx auth_request target -------------------------------------------
  router.get("/check", (req, res) => {
    noStore(res);
    if (!enabled) {
      res.status(204).end();
      return;
    }
    const token = deviceToken(req);
    const ok = isAdmin(req) || (token !== undefined && store.isApproved(token));
    if (!ok) {
      res.status(401).end();
      return;
    }
    // Keep the device cookie alive past browser lifetime caps: refresh it
    // when the app shell is loaded. nginx copies this header onto the
    // response for "/" (auth_request_set in nginx.conf).
    const uri = req.get("x-original-uri") ?? "";
    if (token && (uri === "/" || uri.startsWith("/?"))) {
      setDeviceCookie(res, token);
    }
    res.status(204).end();
  });

  // ---- gate page -----------------------------------------------------------
  const serveGate = (status: number) => (req: Request, res: Response) => {
    ensureDevice(req, res);
    const nonce = crypto.randomBytes(16).toString("base64");
    htmlHeaders(res, nonce);
    res.status(status).send(gatePageHtml(nonce));
  };
  // nginx serves this (via error_page) in place of any blocked request.
  router.get("/page", serveGate(403));
  router.get("/", serveGate(200));

  router.get("/status", (req, res) => {
    noStore(res);
    if (!statusPerIp.hit(ipOf(req))) {
      res.status(429).json({ error: "Too many requests." });
      return;
    }
    const token = ensureDevice(req, res);
    res.json(statusFor(req, token));
  });

  router.post("/request", requireCsrfHeader, (req, res) => {
    noStore(res);
    const token = deviceToken(req);
    if (!token) {
      res.status(400).json({
        error: "This browser isn't keeping cookies. Enable cookies and reload.",
      });
      return;
    }
    const existing = store.getDevice(token);
    if (existing && existing.status !== "pending") {
      res.json(statusFor(req, token));
      return;
    }
    const ip = ipOf(req);
    const devKey = existing?.id ?? hashToken(token);
    // Check both limiters before charging either, so a device-limited call
    // doesn't eat the IP's budget (and vice versa).
    if (
      reqPerIp.retryAfterMs(ip) > 0 ||
      reqPerDevice.retryAfterMs(devKey) > 0
    ) {
      res.status(429).json({
        error: "Too many requests. Please wait a while and try again.",
      });
      return;
    }
    reqPerIp.hit(ip);
    reqPerDevice.hit(devKey);
    try {
      const rec = store.requestAccess(
        token,
        req.body?.note,
        req.get("user-agent"),
      );
      if (!existing) {
        log.info(`gate: new access request ${rec.id.slice(0, 10)} from ${ip}`);
      }
      res.json(statusFor(req, token));
    } catch (e) {
      if (e instanceof GateCapacityError) {
        log.warn(`gate: request rejected (${e.message})`);
        res.status(503).json({
          error: "Too many open requests right now. Try again later.",
        });
        return;
      }
      log.error("gate: failed to save access request", e);
      res.status(500).json({ error: "Could not save your request." });
    }
  });

  // ---- admin -----------------------------------------------------------------
  router.post("/admin/login", requireCsrfHeader, async (req, res) => {
    noStore(res);
    const ip = ipOf(req);
    if (!adminHash) {
      res.status(503).json({ error: "Admin login is not configured." });
      return;
    }
    const gate = loginLimiter.begin(ip);
    if (!gate.allowed) {
      const mins = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
      log.warn(
        `gate: admin login blocked for ${ip} (${gate.reason}, ${mins}m left)`,
      );
      res.setHeader("Retry-After", Math.ceil(gate.retryAfterMs / 1000));
      res.status(429).json({
        error:
          gate.reason === "ip_locked"
            ? `Too many wrong codes. Try again in ${mins} min.`
            : `Admin login is temporarily locked. Try again in ${mins} min.`,
      });
      return;
    }
    let ok = false;
    try {
      ok = await verifyAdminCode(req.body?.code, adminHash);
    } catch (e) {
      log.error("gate: admin code check failed", e);
    }
    if (!ok) {
      const left = loginLimiter.remaining(ip);
      log.warn(`gate: FAILED admin login from ${ip} (${left} tries left)`);
      res.status(401).json({
        error:
          left > 0
            ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.`
            : "Wrong code. Too many attempts; locked for a while.",
      });
      return;
    }
    loginLimiter.succeed(ip);
    const session = store.createAdminSession(ADMIN_SESSION_TTL_MS);
    res.append(
      "Set-Cookie",
      cookieHeader(ADMIN_COOKIE, session, ADMIN_SESSION_TTL_MS / 1000, {
        secure,
        sameSite: "Strict",
      }),
    );
    log.info(`gate: admin login from ${ip}`);
    res.json({ ok: true });
  });

  router.post("/admin/logout", requireCsrfHeader, (req, res) => {
    noStore(res);
    const t = cookiesOf(req).get(ADMIN_COOKIE);
    if (isWellFormedToken(t)) store.deleteAdminSession(t);
    res.append(
      "Set-Cookie",
      cookieHeader(ADMIN_COOKIE, "", 0, { secure, sameSite: "Strict" }),
    );
    res.json({ ok: true });
  });

  router.get("/admin", (req, res) => {
    if (!isAdmin(req)) {
      noStore(res);
      res.redirect(302, "/__gate/");
      return;
    }
    const nonce = crypto.randomBytes(16).toString("base64");
    htmlHeaders(res, nonce);
    res.status(200).send(adminPageHtml(nonce));
  });

  router.get("/admin/requests", requireAdmin, (_req, res) => {
    noStore(res);
    res.json({ requests: store.listDevices().map(adminView) });
  });

  router.post(
    "/admin/requests/:id/:action",
    requireCsrfHeader,
    requireAdmin,
    (req, res) => {
      noStore(res);
      const id = String(req.params.id);
      const action = String(req.params.action);
      if (!/^[0-9a-f]{64}$/.test(id)) {
        res.status(400).json({ error: "Bad id." });
        return;
      }
      if (
        action !== "approve" &&
        action !== "deny" &&
        action !== "revoke" &&
        action !== "delete"
      ) {
        res.status(400).json({ error: "Bad action." });
        return;
      }
      const rec = store.decide(id, action);
      if (rec === undefined) {
        res.status(404).json({ error: "No such request." });
        return;
      }
      log.info(`gate: admin ${action} ${id.slice(0, 10)} (by ${ipOf(req)})`);
      res.json({ ok: true, request: rec ? adminView(rec) : null });
    },
  );

  return { router, adminLoginEnabled: adminHash !== null };
}
