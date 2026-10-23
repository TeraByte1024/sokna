import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Synthetic PostgreSQL only; never calls Supabase, pg_net or FCM.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(path.resolve(process.env.PGLITE_MODULE_PATH)).href
  : "@electric-sql/pglite");
const migration = await readFile(new URL(
  "../supabase/migrations/20261023000000_remove_legacy_push_webhook.sql", import.meta.url), "utf8");
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE TABLE public.notifications (id int PRIMARY KEY, push_status text);
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.notifications TO authenticated;
    CREATE POLICY own_fixture ON public.notifications FOR SELECT TO authenticated USING (false);
    CREATE TABLE public.kept_events (id int);
    CREATE FUNCTION public.keep_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO public.kept_events VALUES (NEW.id); RETURN NEW; END $$;
    CREATE TRIGGER keep_outbox AFTER INSERT ON public.notifications
      FOR EACH ROW EXECUTE FUNCTION public.keep_outbox();
    CREATE SCHEMA supabase_functions;
    CREATE FUNCTION supabase_functions.http_request() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Legacy HTTP webhook must not run'; END $$;
    INSERT INTO public.notifications VALUES (1, 'pending');
    CREATE TRIGGER new_notification AFTER INSERT ON public.notifications FOR EACH ROW
      EXECUTE FUNCTION supabase_functions.http_request(
        'https://example.invalid/functions/v1/send-push', 'POST', '{"Authorization":"synthetic"}');
  `);
  const snapshot = async () => (await db.query(`SELECT
    (SELECT relacl::text FROM pg_class WHERE oid='public.notifications'::regclass) AS acl,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.notifications'::regclass) AS rls,
    (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE tablename='notifications') AS policies,
    (SELECT jsonb_agg(to_jsonb(n)) FROM public.notifications n) AS rows`)).rows;
  const before = await snapshot();
  await db.exec(migration);
  assert.deepEqual(await snapshot(), before, "Preserve rows, grants and RLS");
  assert.deepEqual((await db.query(`SELECT tgname FROM pg_trigger
    WHERE tgrelid='public.notifications'::regclass AND NOT tgisinternal ORDER BY tgname`)).rows,
    [{ tgname: "keep_outbox" }]);
  await db.exec("INSERT INTO public.notifications VALUES (2, 'pending')");
  assert.deepEqual((await db.query("SELECT id FROM public.kept_events ORDER BY id")).rows,
    [{ id: 1 }, { id: 2 }], "Other notification triggers still execute");
  await db.exec(migration); // Safe when the legacy trigger was already removed.
  await db.exec(`CREATE TRIGGER new_notification AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.keep_outbox()`);
  await assert.rejects(db.exec(migration), /Unexpected new_notification trigger/);
  await db.exec("ROLLBACK");
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM pg_trigger
    WHERE tgrelid='public.notifications'::regclass AND tgname='new_notification'`)).rows[0].count, 1);
  console.log("Legacy webhook removal passed: data/ACL/RLS preservation, other triggers, repeat application, drift rejection.");
} finally {
  await db.close();
}
