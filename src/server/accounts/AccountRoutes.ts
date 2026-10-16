import {
  coinsForWin,
  cosmeticPrice,
  GovernmentIdSchema,
} from "@openfront/engine-api/game/Progression";
import { Difficulty } from "@openfront/engine-api/game/GameTypes";
import { bundledItemForFlare } from "@openfront/shared/BundledCosmetics";
import express, { type Request, type Response, type Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  AccountError,
  AccountRecord,
  AccountStore,
  SESSION_COOKIE,
  SESSION_DAYS,
} from "./AccountStore";

/** Header the game workers send on internal calls; see internalSecret(). */
export const INTERNAL_HEADER = "x-sf-internal";
/** Header the account API requires on writes (a cheap CSRF guard). */
export const ACCOUNT_HEADER = "x-sf-account";
/** Set by nginx from the gate's admin session (see DeveloperFlag.ts). */
const DEVELOPER_HEADER = "x-sf-developer";
/** Solo results an account may report per hour. */
const SOLO_PER_HOUR = 30;

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/**
 * The account API (/api/account/*), plus the two internal calls the game
 * workers make (/internal/account/*). Everything sits behind the access
 * gate; the internal calls also need the per-boot secret every worker
 * inherits from the master.
 */
export function accountRouter(
  store: AccountStore,
  secret: string,
): { api: Router; internal: Router } {
  const api = express.Router();
  const internal = express.Router();
  const soloCounts = new Map<string, number[]>();

  const isAdmin = (req: Request) => req.headers[DEVELOPER_HEADER] === "1";
  const current = (req: Request) =>
    store.bySession(readCookie(req.headers.cookie, SESSION_COOKIE));

  const setSession = (req: Request, res: Response, token: string | null) => {
    const secure = req.headers["x-forwarded-proto"] === "https";
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
        token === null ? 0 : SESSION_DAYS * 86_400
      }${secure ? "; Secure" : ""}`,
    );
  };

  const fail = (res: Response, e: unknown) => {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "bad_input" });
    } else if (e instanceof AccountError) {
      res.status(e.status).json({ error: e.code });
    } else {
      res.status(500).json({ error: "server_error" });
    }
  };

  /** Writes need the custom header (a plain form post can't send one). */
  const guard = (req: Request, res: Response): boolean => {
    if (req.headers[ACCOUNT_HEADER] !== "1") {
      res.status(403).json({ error: "missing_header" });
      return false;
    }
    return true;
  };

  const withAccount = (
    handler: (a: AccountRecord, req: Request, res: Response) => void,
  ) =>
    (req: Request, res: Response) => {
      if (!guard(req, res)) return;
      const a = current(req);
      if (a === null) {
        res.status(401).json({ error: "not_logged_in" });
        return;
      }
      try {
        handler(a, req, res);
        res.json({ profile: store.profile(a, isAdmin(req)) });
      } catch (e) {
        fail(res, e);
      }
    };

  const signInLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20 });
  const Credentials = z.object({
    username: z.string().max(40),
    password: z.string().max(200),
  });

  api.get("/me", (req, res) => {
    const a = current(req);
    res.json({
      profile: a === null ? null : store.profile(a, isAdmin(req)),
      admin: isAdmin(req),
    });
  });

  api.post("/register", signInLimit, async (req, res) => {
    if (!guard(req, res)) return;
    const body = Credentials.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: "bad_input" });
    try {
      const token = await store.register(body.data.username, body.data.password);
      setSession(req, res, token);
      const a = store.bySession(token)!;
      res.json({ profile: store.profile(a, isAdmin(req)) });
    } catch (e) {
      fail(res, e);
    }
  });

  api.post("/login", signInLimit, async (req, res) => {
    if (!guard(req, res)) return;
    const body = Credentials.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: "bad_input" });
    try {
      const token = await store.login(body.data.username, body.data.password);
      setSession(req, res, token);
      const a = store.bySession(token)!;
      res.json({ profile: store.profile(a, isAdmin(req)) });
    } catch (e) {
      fail(res, e);
    }
  });

  api.post("/logout", (req, res) => {
    if (!guard(req, res)) return;
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token !== undefined) store.logout(token);
    setSession(req, res, null);
    res.json({ profile: null });
  });

  api.post(
    "/buy-cosmetic",
    withAccount((a, req) => {
      const flare = z.string().max(80).parse(req.body?.flare);
      const item = bundledItemForFlare(flare);
      if (item === null) throw new AccountError("no_such_item");
      // Admins own everything already; nothing to buy.
      if (isAdmin(req)) return;
      store.buyCosmetic(a, flare, cosmeticPrice(item.rarity));
    }),
  );

  api.post(
    "/buy-rp",
    withAccount((a, req) => {
      store.buyResearch(a, z.number().int().parse(req.body?.rp));
    }),
  );

  api.post(
    "/unlock",
    withAccount((a, req) => {
      store.unlock(a, z.string().max(32).parse(req.body?.node), isAdmin(req));
    }),
  );

  api.post(
    "/buff",
    withAccount((a, req) => {
      store.buff(a, z.string().max(32).parse(req.body?.buff), isAdmin(req));
    }),
  );

  api.post(
    "/government",
    withAccount((a, req) => {
      store.setGovernment(
        a,
        GovernmentIdSchema.parse(req.body?.government),
        isAdmin(req),
      );
    }),
  );

  /**
   * A singleplayer game finished. Singleplayer runs entirely in the browser,
   * so this is the player's word; it is rate limited, paid once per game id,
   * and research points are capped per match.
   */
  const SoloResult = z.object({
    gameID: z.string().max(20),
    difficulty: z.enum(Difficulty),
    won: z.boolean(),
    researchPoints: z.number().int().min(0).max(100_000),
    unlockAll: z.boolean(),
  });
  api.post(
    "/solo-result",
    withAccount((a, req) => {
      const r = SoloResult.parse(req.body);
      if (r.unlockAll) return; // Unlocked games pay nothing.
      const now = Date.now();
      const recent = (soloCounts.get(a.id) ?? []).filter(
        (t) => now - t < 3_600_000,
      );
      if (recent.length >= SOLO_PER_HOUR) {
        throw new AccountError("too_many", 429);
      }
      recent.push(now);
      soloCounts.set(a.id, recent);
      store.reward(
        a,
        `solo:${r.gameID}`,
        r.won ? coinsForWin(r.difficulty, false) : 0,
        r.researchPoints,
      );
    }),
  );

  // ----------------------------------------------------------- internal --

  const internalOnly = (req: Request, res: Response): boolean => {
    if (req.headers[INTERNAL_HEADER] !== secret) {
      res.status(404).end();
      return false;
    }
    return true;
  };

  /** A worker resolving a joining player's session cookie. */
  internal.post("/session", (req, res) => {
    if (!internalOnly(req, res)) return;
    const a = store.bySession(z.string().max(100).parse(req.body?.token));
    if (a === null) return void res.json({ account: null });
    const admin = req.body?.admin === true;
    res.json({
      account: {
        id: a.id,
        progression: store.progression(a, admin),
        owned: [...a.owned],
      },
    });
  });

  /** A worker paying out a finished multiplayer game. */
  internal.post("/reward", (req, res) => {
    if (!internalOnly(req, res)) return;
    const body = z
      .object({
        accountId: z.string().max(40),
        gameID: z.string().max(20),
        coins: z.number().int().min(0).max(100_000),
        rp: z.number().int().min(0).max(100_000),
      })
      .safeParse(req.body);
    if (!body.success) return void res.status(400).end();
    const a = store.byId(body.data.accountId);
    if (a === null) return void res.status(404).end();
    store.reward(a, body.data.gameID, body.data.coins, body.data.rp);
    res.json({ ok: true });
  });

  return { api, internal };
}
