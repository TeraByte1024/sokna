import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(modulePath).href : "@electric-sql/pglite");
const db = new PGlite();
const own = "11111111-2222-4333-8444-555555555555";
const other = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const hash = "a".repeat(64);
let checks = 0;
const equal = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const denied = async (sql) => { await assert.rejects(db.exec(sql)); checks++; };
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${own}'), ('${other}');`);
  const defaults = (await db.query("SELECT * FROM pg_default_acl ORDER BY oid")).rows;
  await db.exec(await readFile(new URL("../supabase/migrations/20261022000000_record_legal_consents.sql", import.meta.url), "utf8"));
  equal((await db.query("SELECT * FROM pg_default_acl ORDER BY oid")).rows, defaults);
  await db.exec("SET ROLE anon");
  await denied("SELECT * FROM public.user_legal_consents");
  await db.exec("SET ROLE service_role");
  const insert = (id, kind = "terms") => `INSERT INTO public.user_legal_consents
    (user_id, document_kind, document_version, document_hash, document_title, document_content)
    VALUES ('${id}', '${kind}', 'v1', '${hash}', 'Test', 'Isolated test content')`;
  await db.exec(insert(own));
  await db.exec(insert(other));
  equal(await scalar("SELECT count(*)::int FROM public.user_legal_consents"), 2);
  const acceptedAt = await scalar(`SELECT accepted_at::text FROM public.user_legal_consents WHERE user_id='${own}'`);
  await db.exec(`${insert(own)} ON CONFLICT (user_id, document_kind, document_version, document_hash) DO NOTHING`);
  equal(await scalar(`SELECT accepted_at::text FROM public.user_legal_consents WHERE user_id='${own}'`), acceptedAt);
  await denied("UPDATE public.user_legal_consents SET document_content='changed'");
  await denied("DELETE FROM public.user_legal_consents");
  await denied(insert(own, "marketing"));
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${own}', false)`);
  equal(await scalar("SELECT count(*)::int FROM public.user_legal_consents"), 1);
  equal(await scalar("SELECT user_id::text FROM public.user_legal_consents"), own);
  await denied(insert(own, "privacy"));
  await denied(insert(other, "privacy"));
  await denied("UPDATE public.user_legal_consents SET accepted_at='2000-01-01'");
  await denied("DELETE FROM public.user_legal_consents");
  await db.exec(`SET ROLE postgres; DELETE FROM auth.users WHERE id='${own}'`);
  equal(await scalar("SELECT count(*)::int FROM public.user_legal_consents"), 1);
  console.log(`${checks} legal consent SQL checks passed in isolated PostgreSQL/PGlite.`);
} finally { await db.close(); }
