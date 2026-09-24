import crypto from "crypto";
import fs from "fs";
import path from "path";

// Persistent state for the access gate: one small JSON file on a Docker
// volume. No database.
//
// Device tokens and admin session tokens are never written to disk. The file
// is keyed by sha256(token), so a copy of the file can't be replayed as a
// cookie. The same hash (its "id") is what the admin panel uses to address a
// request.

export type DeviceStatus = "pending" | "approved" | "denied";

export interface DeviceRecord {
  id: string;
  status: DeviceStatus;
  note: string;
  userAgent: string;
  requestedAt: number;
  updatedAt: number;
  decidedAt?: number;
  /** Set when an approved device was later revoked. */
  revokedAt?: number;
}

interface AdminSessionRecord {
  createdAt: number;
  expiresAt: number;
}

interface GateFile {
  version: 1;
  devices: Record<string, DeviceRecord>;
  adminSessions: Record<string, AdminSessionRecord>;
}

export const MAX_NOTE_LENGTH = 80;
export const MAX_USER_AGENT_LENGTH = 300;

export class GateCapacityError extends Error {}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Tokens we mint are 43 base64url chars; reject anything else outright. */
export function isWellFormedToken(token: string | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Drop control characters, collapse whitespace, trim, cap length.
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

export interface GateStoreOptions {
  file: string;
  now?: () => number;
  maxPending?: number;
  maxRecords?: number;
  log?: { info: (m: string) => void; error: (m: string, e?: unknown) => void };
}

export class GateStore {
  private data: GateFile = { version: 1, devices: {}, adminSessions: {} };
  private readonly now: () => number;
  private readonly maxPending: number;
  private readonly maxRecords: number;
  private readonly log: NonNullable<GateStoreOptions["log"]>;

  constructor(private readonly opts: GateStoreOptions) {
    this.now = opts.now ?? Date.now;
    this.maxPending = opts.maxPending ?? 200;
    this.maxRecords = opts.maxRecords ?? 5000;
    this.log = opts.log ?? {
      info: (m) => console.log(m),
      error: (m, e) => console.error(m, e),
    };
    this.load();
  }

  get file(): string {
    return this.opts.file;
  }

  // ---- devices ------------------------------------------------------------

  getDevice(deviceToken: string): DeviceRecord | undefined {
    return this.data.devices[hashToken(deviceToken)];
  }

  isApproved(deviceToken: string): boolean {
    return this.getDevice(deviceToken)?.status === "approved";
  }

  /**
   * Files (or refreshes) a pending request for this device. Approved and
   * denied devices are returned unchanged: approval sticks, and a denied
   * device can't put itself back in the queue.
   */
  requestAccess(
    deviceToken: string,
    note: unknown,
    userAgent: unknown,
  ): DeviceRecord {
    const id = hashToken(deviceToken);
    const existing = this.data.devices[id];
    const t = this.now();
    if (existing && existing.status !== "pending") return existing;
    if (existing) {
      existing.note = cleanText(note, MAX_NOTE_LENGTH) || existing.note;
      existing.userAgent = cleanText(userAgent, MAX_USER_AGENT_LENGTH);
      existing.updatedAt = t;
      this.save();
      return existing;
    }
    const all = Object.values(this.data.devices);
    if (all.filter((d) => d.status === "pending").length >= this.maxPending) {
      throw new GateCapacityError("too many pending requests");
    }
    if (all.length >= this.maxRecords) {
      // Make room by dropping the oldest denied records; never touch
      // approved devices.
      const denied = all
        .filter((d) => d.status === "denied")
        .sort((a, b) => a.updatedAt - b.updatedAt);
      if (denied.length === 0) {
        throw new GateCapacityError("gate store is full");
      }
      delete this.data.devices[denied[0].id];
    }
    const rec: DeviceRecord = {
      id,
      status: "pending",
      note: cleanText(note, MAX_NOTE_LENGTH),
      userAgent: cleanText(userAgent, MAX_USER_AGENT_LENGTH),
      requestedAt: t,
      updatedAt: t,
    };
    this.data.devices[id] = rec;
    this.save();
    return rec;
  }

  listDevices(): DeviceRecord[] {
    return Object.values(this.data.devices).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  /** approve: pending|denied -> approved. deny: pending -> denied.
   *  revoke: approved -> denied. Returns undefined for an unknown id. */
  decide(
    id: string,
    action: "approve" | "deny" | "revoke" | "delete",
  ): DeviceRecord | undefined | null {
    const rec = this.data.devices[id];
    if (!rec) return undefined;
    const t = this.now();
    switch (action) {
      case "approve":
        rec.status = "approved";
        rec.decidedAt = t;
        delete rec.revokedAt;
        break;
      case "deny":
        rec.status = "denied";
        rec.decidedAt = t;
        break;
      case "revoke":
        if (rec.status === "approved") rec.revokedAt = t;
        rec.status = "denied";
        rec.decidedAt = t;
        break;
      case "delete":
        delete this.data.devices[id];
        this.save();
        return null;
    }
    rec.updatedAt = t;
    this.save();
    return rec;
  }

  // ---- admin sessions -----------------------------------------------------

  createAdminSession(ttlMs: number): string {
    const token = newToken();
    const t = this.now();
    this.pruneSessions(t);
    this.data.adminSessions[hashToken(token)] = {
      createdAt: t,
      expiresAt: t + ttlMs,
    };
    this.save();
    return token;
  }

  isAdminSession(token: string): boolean {
    const s = this.data.adminSessions[hashToken(token)];
    return s !== undefined && s.expiresAt > this.now();
  }

  deleteAdminSession(token: string): void {
    delete this.data.adminSessions[hashToken(token)];
    this.save();
  }

  private pruneSessions(t: number): void {
    for (const [k, s] of Object.entries(this.data.adminSessions)) {
      if (s.expiresAt <= t) delete this.data.adminSessions[k];
    }
  }

  // ---- persistence --------------------------------------------------------

  private load(): void {
    const file = this.opts.file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      this.log.info(`gate: no data file at ${file}, starting empty`);
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as GateFile;
      if (
        parsed?.version !== 1 ||
        typeof parsed.devices !== "object" ||
        parsed.devices === null
      ) {
        throw new Error("unrecognised gate file format");
      }
      this.data = {
        version: 1,
        devices: parsed.devices,
        adminSessions: parsed.adminSessions ?? {},
      };
      this.log.info(
        `gate: loaded ${Object.keys(this.data.devices).length} device records`,
      );
    } catch (e) {
      // Fail closed: keep the broken file for inspection and start empty,
      // which locks everyone out but lets nobody in.
      const aside = `${file}.corrupt-${this.now()}`;
      this.log.error(`gate: could not read ${file}, moved to ${aside}`, e);
      try {
        fs.renameSync(file, aside);
      } catch {
        /* ignore */
      }
    }
  }

  private save(): void {
    const file = this.opts.file;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(tmp, file);
  }
}
