import path from "path";
import { createGate, type Gate, type GateLogger } from "./Gate";
import { GateStore } from "./GateStore";

// Builds the access gate from environment variables (master process only).
//
//   GATE_ENABLED        "false" turns the check into a no-op. Default: on.
//   GATE_DATA_DIR       Directory for requests.json. Mount a volume here.
//                       The Docker image sets /data/gate. Default outside
//                       Docker: ./data/gate (gitignored).
//   ADMIN_CODE_HASH     scrypt:N:r:p:salt:hash from GenerateAdminCode.ts.
//                       Unset/invalid: admin login is disabled, the site stays
//                       locked (fail closed).
//   GATE_COOKIE_SECURE  "false" drops the Secure flag (plain-http testing).
//                       Default: Secure unless GAME_ENV=dev.

export function createGateFromEnv(log: GateLogger): Gate {
  const env = process.env;
  const dataDir = env.GATE_DATA_DIR ?? path.join(process.cwd(), "data", "gate");
  const store = new GateStore({
    file: path.join(dataDir, "requests.json"),
    log: { info: log.info, error: log.error },
  });
  const secureDefault = (env.GAME_ENV ?? "").toLowerCase() !== "dev";
  return createGate({
    store,
    adminCodeHash: env.ADMIN_CODE_HASH,
    enabled: env.GATE_ENABLED !== "false",
    secureCookies:
      env.GATE_COOKIE_SECURE === undefined
        ? secureDefault
        : env.GATE_COOKIE_SECURE !== "false",
    log,
  });
}
