import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Synthetic accounts only. No Supabase Auth, email or FCM calls.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : "@electric-sql/pglite");
const read = (file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
const outbox = await read("20260927000000_simplify_notification_outbox.sql");
const extract = (name) => outbox.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(\\)[\\s\\S]*?END;\\s*\\$\\$;`))[0];
const migration = await read("20261024000000_remove_automatic_member_profiles.sql");
const db = new PGlite();
const old = "11111111-2222-4333-8444-555555555555";
const audience = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
try {
  await db.exec(`CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.users (id uuid PRIMARY KEY REFERENCES auth.users(id), name text, generation int,
      part text, email text, status text DEFAULT 'pending', applied_at timestamptz, marketing_opt_in boolean);
    CREATE TABLE public.admins (id uuid PRIMARY KEY);
    CREATE TABLE public.notifications (recipient uuid, event_type text, event_key text);
    CREATE FUNCTION public.create_app_notification(uuid,text,text,jsonb) RETURNS void LANGUAGE sql AS $$
      INSERT INTO public.notifications VALUES ($1,$2,$3) $$;
    ${extract("handle_new_user")}
    ${extract("notify_member_application")}
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    CREATE TRIGGER users_notify_member_application AFTER INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.notify_member_application();
    CREATE TABLE public.email_events (id uuid);
    CREATE FUNCTION public.keep_email_sync() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO public.email_events VALUES (NEW.id); RETURN NEW; END $$;
    CREATE TRIGGER auth_users_sync_member_email AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION public.keep_email_sync();
    INSERT INTO auth.users (id,email) VALUES ('${old}', 'existing@example.test');
    INSERT INTO public.admins VALUES ('${old}');
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT ON public.users TO authenticated;
    CREATE POLICY existing_read ON public.users FOR SELECT TO authenticated USING (true);
    CREATE POLICY application_insert ON public.users FOR INSERT TO authenticated WITH CHECK (status='pending');`);
  const snapshot = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(u)) FROM public.users u) AS members,
    (SELECT relacl::text FROM pg_class WHERE oid='public.users'::regclass) AS acl,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass) AS rls,
    (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE tablename='users') AS policies`)).rows;
  const before = await snapshot();
  await db.exec(migration);
  assert.deepEqual(await snapshot(), before);
  await db.exec(`INSERT INTO auth.users (id,email) VALUES ('${audience}','audience@example.test')`);
  assert.equal(await scalar(`SELECT count(*)::int FROM public.users WHERE id='${audience}'`), 0);
  assert.equal(await scalar("SELECT count(*)::int FROM public.notifications"), 0);
  await db.exec(`SET ROLE authenticated;
    INSERT INTO public.users (id,name,generation,part,email,applied_at,marketing_opt_in)
    VALUES ('${audience}','Synthetic applicant',40,'기타','audience@example.test',now(),false);
    RESET ROLE;`);
  assert.equal(await scalar("SELECT count(*)::int FROM public.notifications WHERE event_type='member_approval_requested'"), 1);
  await db.exec(`UPDATE auth.users SET email='changed@example.test' WHERE id='${audience}'`);
  assert.equal(await scalar("SELECT count(*)::int FROM public.email_events"), 1);
  await db.exec(migration);
  await db.exec(`CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.keep_email_sync()`);
  await assert.rejects(db.exec(migration), /Unexpected on_auth_user_created trigger/);
  await db.exec("ROLLBACK");
  assert.equal(await scalar("SELECT count(*)::int FROM pg_trigger WHERE tgname='on_auth_user_created'"), 1);
  console.log("Audience separation passed: no automatic member or notification, explicit application notification, preserved data/ACL/RLS/email trigger, repeat apply and drift rejection.");
} finally { await db.close(); }
