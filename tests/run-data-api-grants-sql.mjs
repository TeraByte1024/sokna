import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Isolated PostgreSQL only. Never connects to Supabase or sends notifications.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(path.resolve(modulePath)).href : "@electric-sql/pglite");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");
const migration = await read("supabase/migrations/20261020000000_make_data_api_grants_explicit.sql");
const membershipFixture = await read("tests/approved-gig-membership.sql");
const setup = membershipFixture.match(/\/\* SETUP_BEFORE_MIGRATION\r?\n([\s\S]*?)\r?\nEND_SETUP_BEFORE_MIGRATION \*\//)?.[1];
if (!setup) throw new Error("Missing isolated membership fixture");
const member = "10000000-0000-4000-8000-000000000001";
const pending = "10000000-0000-4000-8000-000000000002";
const admin = "10000000-0000-4000-8000-000000000006";
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const db = new PGlite();
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const asRole = async (role, user = "") => {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`SET ROLE ${role}`);
};
const denied = async (sql) => {
  await assert.rejects(db.exec(sql), (error) => error.code === "42501");
  checks++;
};
const policySnapshot = () => db.query(`SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`);
const functionSnapshot = () => db.query(`SELECT oid::text, proacl::text FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace ORDER BY oid`);

try {
  await db.exec(setup);
  await db.exec(await read("supabase/migrations/20260927010000_require_approved_gig_membership.sql"));
  await db.exec(await read("supabase/migrations/20260912143444_fix_admins_table_rls.sql"));
  await db.exec(`ALTER TABLE public.admins ADD COLUMN email text;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;`);
  const viewMigration = await read("supabase/migrations/20260916020000_add_setlist_views_and_notification_queue.sql");
  const queueBoundary = viewMigration.indexOf("CREATE TABLE IF NOT EXISTS public.gig_notification_queue");
  if (queueBoundary < 0) throw new Error("setlist_views migration layout changed");
  await db.exec(viewMigration.slice(0, queueBoundary));
  await db.exec(`
    CREATE TABLE public.photos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      fcm_token text, device_name text);
    CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      body text, read_at timestamptz, push_status text DEFAULT 'pending');
    ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY photos_read ON public.photos FOR SELECT USING (true);
    -- Match the existing production policy's direct admins dependency.
    CREATE POLICY photos_admin ON public.photos FOR ALL
      USING (EXISTS (SELECT 1 FROM public.admins WHERE email = auth.jwt() ->> 'email'));
    CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated
      USING (user_id = auth.uid());
    CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
    INSERT INTO public.notifications (user_id, body) VALUES ('${member}', 'Own'), ('${pending}', 'Foreign');
    CREATE SEQUENCE public.gigs_id_seq START 1000 OWNED BY public.gigs.id;
    ALTER TABLE public.gigs ALTER COLUMN id SET DEFAULT nextval('public.gigs_id_seq');
    ALTER TABLE public.nomination_responses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (START WITH 1000);
    CREATE TABLE public.private_internal (id bigint);
    ALTER TABLE public.private_internal ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
    -- Simulate the new defaults without changing the linked project's settings.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
  `);
  // Actual push-profile ownership/consent policies from the application migration.
  const push = await read("supabase/migrations/20260922010000_enable_web_push_delivery.sql");
  const policyStart = push.indexOf("ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;");
  const policyEnd = push.indexOf("CREATE OR REPLACE FUNCTION", policyStart);
  if (policyStart < 0 || policyEnd < 0) throw new Error("Push-profile policy migration layout changed");
  await db.exec(push.slice(policyStart, policyEnd));
  const beforePolicies = (await policySnapshot()).rows;
  const beforeFunctions = (await functionSnapshot()).rows;
  const beforeDefaults = (await db.query("SELECT * FROM pg_default_acl ORDER BY oid")).rows;
  await asRole("anon");
  await denied("SELECT * FROM public.gigs");
  await asRole("service_role");
  await denied("SELECT * FROM public.notifications");
  await denied("SELECT public.test_trusted_profile_write(NULL::uuid)");
  await asRole("postgres");

  // RLS preflight must roll back the entire transaction, before any grants.
  await db.exec("ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY");
  await assert.rejects(db.exec(migration), /Expected RLS-enabled public.profiles/);
  checks++;
  await db.exec("ROLLBACK");
  equal(await scalar("SELECT has_table_privilege('anon', 'public.gigs', 'SELECT')"), false);
  await db.exec("ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY");
  await db.exec(migration);
  equal((await policySnapshot()).rows, beforePolicies, "RLS policies must be preserved");
  equal((await functionSnapshot()).rows, beforeFunctions, "RPC/trigger ACLs must be preserved");
  equal((await db.query("SELECT * FROM pg_default_acl ORDER BY oid")).rows, beforeDefaults,
    "Deployment must preserve default privileges");

  const matrix = {
    anon: { select: ["admins", "gigs", "performers", "setlists", "nominations", "photos", "users"] },
    authenticated: {
      select: ["admins", "gig_rsvps", "gigs", "nomination_responses", "nominations", "notifications", "performers", "photos", "profiles", "setlist_views", "setlists", "users"],
      insert: ["admins", "gig_rsvps", "gigs", "nomination_responses", "nominations", "notifications", "performers", "photos", "profiles", "setlist_views", "setlists", "users"],
      update: ["admins", "gig_rsvps", "gigs", "nomination_responses", "nominations", "performers", "photos", "profiles", "setlist_views", "setlists", "users"],
      delete: ["admins", "gig_rsvps", "gigs", "nomination_responses", "nominations", "performers", "photos", "profiles", "setlists", "users"],
    },
    service_role: { select: ["users", "profiles", "notifications"], update: ["profiles", "notifications"], delete: ["profiles", "notifications"] },
  };
  const tables = matrix.authenticated.select.concat("private_internal");
  for (const [role, operations] of Object.entries(matrix)) {
    for (const operation of ["select", "insert", "update", "delete"]) {
      for (const table of tables) {
        equal(await scalar("SELECT has_table_privilege($1, $2, $3)", [role, `public.${table}`, operation]),
          (operations[operation] ?? []).includes(table), `${role} ${operation} ${table}`);
      }
    }
  }
  await asRole("anon");
  equal(await scalar("SELECT array_agg(id ORDER BY id) FROM public.gigs"), [1]);
  equal(await scalar("SELECT count(*)::int FROM public.performers"), 1);
  equal(await scalar("SELECT count(*)::int FROM public.photos"), 0, "Public photos policy must resolve its admins subquery");
  equal(await scalar("SELECT count(*)::int FROM public.admins"), 0, "Anonymous admin rows stay hidden by RLS");
  await denied("SELECT * FROM public.profiles");
  await denied("SELECT * FROM public.notifications");
  await denied("INSERT INTO public.gigs (title, visibility) VALUES ('Forbidden', 'public')");

  await asRole("authenticated", pending);
  equal(await scalar("SELECT array_agg(id ORDER BY id) FROM public.gigs"), [1]);
  await denied(`INSERT INTO public.nomination_responses (nomination_id, user_id) VALUES (1, '${pending}')`);
  await asRole("authenticated", member);
  equal(await scalar("SELECT array_agg(id ORDER BY id) FROM public.gigs"), [1, 2]);
  equal(await scalar("SELECT count(*)::int FROM public.notifications"), 1);
  await db.exec(`INSERT INTO public.setlist_views (user_id, gig_id, last_viewed_at)
    VALUES ('${member}', 2, '2000-01-01T00:00:00Z')`);
  await db.exec(`INSERT INTO public.setlist_views (user_id, gig_id) VALUES ('${member}', 2)
    ON CONFLICT (user_id, gig_id) DO UPDATE SET last_viewed_at = now()`);
  equal(await scalar("SELECT count(*)::int FROM public.setlist_views"), 1);
  equal(await scalar("SELECT last_viewed_at > '2000-01-01T00:00:00Z' FROM public.setlist_views"), true);
  await denied(`INSERT INTO public.setlist_views (user_id, gig_id) VALUES ('${pending}', 2)`);
  await db.exec(`INSERT INTO public.nomination_responses (nomination_id, user_id) VALUES (2, '${member}')`);
  equal(await scalar("SELECT count(*)::int FROM public.nomination_responses WHERE id >= 1000"), 1);
  await denied(`INSERT INTO public.nomination_responses (nomination_id, user_id) VALUES (2, '${pending}')`);
  await denied(`INSERT INTO public.profiles (user_id, fcm_token) VALUES ('${member}', 'unconsented')`);
  await db.exec(`UPDATE public.users SET marketing_opt_in = true WHERE id = '${member}'`);
  await db.exec(`INSERT INTO public.profiles (user_id, fcm_token) VALUES ('${member}', 'synthetic-token')`);
  await denied("UPDATE public.notifications SET push_status = 'sent'");
  equal(await scalar("SELECT public.is_approved_member()"), true);

  await asRole("authenticated", admin);
  equal(await scalar("SELECT count(*)::int FROM public.gigs"), 3);
  await db.exec("INSERT INTO public.gigs (title, visibility) VALUES ('Serial insert', 'private')");
  equal(await scalar("SELECT id::int FROM public.gigs WHERE title = 'Serial insert'"), 1000);
  await db.exec(`INSERT INTO public.notifications (user_id, body) VALUES ('${member}', 'Admin notice')`);
  await asRole("service_role");
  equal(await scalar("SELECT count(*)::int FROM public.notifications"), 3);
  await db.exec("UPDATE public.notifications SET push_status = 'sent', read_at = now()");
  equal(await scalar("SELECT count(*)::int FROM public.notifications WHERE push_status = 'sent'"), 3);
  await db.exec("UPDATE public.profiles SET user_id = NULL");
  equal(await scalar("SELECT count(*)::int FROM public.profiles WHERE user_id IS NULL"), 1);
  await db.exec("DELETE FROM public.profiles; DELETE FROM public.notifications");
  equal(await scalar("SELECT count(*)::int FROM public.notifications"), 0);

  await asRole("postgres");
  await db.exec("CREATE TABLE public.future_private (id bigserial PRIMARY KEY)");
  for (const role of ["anon", "authenticated", "service_role"]) {
    equal(await scalar("SELECT has_table_privilege($1, 'public.future_private', 'SELECT')", [role]), false);
    equal(await scalar("SELECT has_sequence_privilege($1, 'public.future_private_id_seq', 'USAGE')", [role]), false);
  }
  // Simulate pre-existing legacy permissions: this migration must not revoke them.
  await db.exec("GRANT UPDATE ON public.notifications TO authenticated");
  await db.exec(migration);
  equal(await scalar("SELECT has_table_privilege('authenticated', 'public.notifications', 'UPDATE')"), true);
  equal((await policySnapshot()).rows, beforePolicies, "Repeated application preserves RLS");
  equal((await functionSnapshot()).rows, beforeFunctions, "Repeated application preserves RPC ACLs");
} finally {
  await db.close();
}
console.log(`Data API grant checks passed: ${checks}. Isolated PostgreSQL; no remote API or device delivery proof.`);
