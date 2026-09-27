import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Optional isolated tooling; no application dependency or remote database access.
// PGLITE_MODULE_PATH may point to an existing @electric-sql/pglite/dist/index.js.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(path.resolve(modulePath)).href
  : "@electric-sql/pglite");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filename) => readFile(path.join(root, filename), "utf8");
const testSql = await read("tests/push-consent.sql");
const setup = testSql.match(/\/\* SETUP_BEFORE_MIGRATION\r?\n([\s\S]*?)\r?\nEND_SETUP_BEFORE_MIGRATION \*\//)?.[1];
if (!setup) throw new Error("Missing isolated consent test setup");
const approval = await read("supabase/migrations/20260927010000_require_approved_gig_membership.sql");
// Apply the real membership functions/trigger; subsequent gig policies concern
// tables outside this fixture and are covered by approved-gig-membership.sql.
const approvalBoundary = approval.indexOf("ALTER POLICY ");
const approvalGuard = approval.slice(0, approvalBoundary);
if (approvalBoundary < 0 || !approvalGuard.includes("CREATE TRIGGER users_protect_member_approval")) {
  throw new Error("Membership approval guard migration layout changed");
}
const db = new PGlite();
try {
  await db.exec(setup);
  await db.exec(await read("supabase/migrations/20260925000000_track_marketing_consent_time.sql"));
  await db.exec(`${approvalGuard}\nCOMMIT;`);
  await db.exec(await read("supabase/migrations/20260927020000_unify_push_consent.sql"));
  await db.exec(testSql);
  console.log("Consent SQL regressions passed in isolated PostgreSQL/PGlite.");
} finally {
  await db.close();
}
