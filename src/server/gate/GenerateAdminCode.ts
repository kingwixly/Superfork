// Generates the access-gate admin code and its ADMIN_CODE_HASH.
//
//   npx tsx src/server/gate/GenerateAdminCode.ts           # new random 6-digit code
//   npx tsx src/server/gate/GenerateAdminCode.ts 123456    # hash a code you chose
//
// Put ONLY the hash in docker-compose.yml (ADMIN_CODE_HASH). Keep the code
// itself private; never commit it. To change the code, run this again and
// replace the hash.
import {
  ADMIN_CODE_PATTERN,
  generateAdminCode,
  hashAdminCode,
} from "./AdminCode";

async function main() {
  const given = process.argv[2];
  if (given !== undefined && !ADMIN_CODE_PATTERN.test(given)) {
    console.error("The code must be exactly 6 digits.");
    process.exit(1);
  }
  const code = given ?? generateAdminCode();
  const hash = await hashAdminCode(code);
  console.log(`Admin code (keep private): ${code}`);
  console.log(`ADMIN_CODE_HASH=${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
