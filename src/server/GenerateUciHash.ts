// Prints a UCI_PASSWORD_HASH line for a password read from stdin, so the
// password never appears in shell history or the process list:
//
//   npx tsx src/server/GenerateUciHash.ts
//   (type the password, press Enter)
//
// Put ONLY the printed hash in the server's environment.
import { createInterface } from "readline";
import { hashUciPassword } from "./UciAuth";

const rl = createInterface({ input: process.stdin });
rl.once("line", async (line) => {
  rl.close();
  console.log(`UCI_PASSWORD_HASH=${await hashUciPassword(line.trim())}`);
});
