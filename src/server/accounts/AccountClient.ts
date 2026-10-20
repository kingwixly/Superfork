import { Progression } from "@openfront/engine-api/game/Progression";
import { INTERNAL_HEADER } from "./AccountRoutes";

/** Env var holding the per-boot worker -> master secret. */
export const INTERNAL_SECRET_ENV = "SF_INTERNAL_SECRET";
const MASTER = "http://127.0.0.1:3000/internal/account";

export interface JoiningAccount {
  id: string;
  progression: Progression;
  /** Cosmetic flares the account owns. */
  owned: string[];
}

async function call(pathname: string, body: unknown): Promise<unknown> {
  const secret = process.env[INTERNAL_SECRET_ENV];
  if (secret === undefined) return null;
  try {
    const res = await fetch(`${MASTER}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_HEADER]: secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The account behind a session cookie, or null (guest, or master down). */
export async function accountForSession(
  token: string | undefined,
  admin: boolean,
): Promise<JoiningAccount | null> {
  if (token === undefined) return null;
  const r = (await call("/session", { token, admin })) as {
    account: JoiningAccount | null;
  } | null;
  return r?.account ?? null;
}

/** Pay a finished multiplayer game out to an account (fire and forget). */
export function rewardAccount(
  accountId: string,
  gameID: string,
  coins: number,
  rp: number,
): void {
  void call("/reward", { accountId, gameID, coins, rp });
}
