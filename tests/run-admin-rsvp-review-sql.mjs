import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Optional isolated SQL test: point PGLITE_MODULE_PATH at an existing PGlite
// dist/index.js. It never connects to the linked Supabase project.
const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath
  ? pathToFileURL(path.resolve(modulePath)).href
  : "@electric-sql/pglite");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(
  path.join(root, "supabase/migrations/20260930020000_admin_console_reviews.sql"), "utf8");
const admin = "10000000-0000-4000-8000-000000000001";
const applicant = "10000000-0000-4000-8000-000000000002";
const existing = "10000000-0000-4000-8000-000000000003";
const db = new PGlite();
const one = async (sql) => (await db.query(sql)).rows[0];
const asUser = async (id) => {
  await db.exec("SET ROLE authenticated");
  await db.exec(`SET request.jwt.claim.sub = '${id}'`);
};
const reset = async () => db.exec("RESET ROLE");

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.users (
      id uuid PRIMARY KEY, name text NOT NULL, generation integer,
      marketing_opt_in boolean NOT NULL DEFAULT false
    );
    CREATE TABLE public.admins (id uuid PRIMARY KEY);
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
      SECURITY DEFINER SET search_path = '' AS $$
        SELECT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid())
      $$;
    CREATE TABLE public.gigs (id bigint PRIMARY KEY, title text);
    CREATE TABLE public.performers (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      gig_id bigint NOT NULL REFERENCES public.gigs,
      user_id uuid REFERENCES public.users,
      part text NOT NULL
    );
    CREATE TABLE public.gig_rsvps (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      gig_id bigint NOT NULL REFERENCES public.gigs,
      user_id uuid NOT NULL REFERENCES public.users,
      status text NOT NULL, part text, note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (gig_id, user_id)
    );
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL, event_type text NOT NULL, event_key text NOT NULL,
      title text NOT NULL, body text NOT NULL, link text NOT NULL,
      push_status text NOT NULL, push_error text,
      UNIQUE (user_id, event_type, event_key)
    );
    ALTER TABLE public.gig_rsvps ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view their own rsvp or admins view all"
      ON public.gig_rsvps FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
    CREATE POLICY "Users can insert their own rsvp"
      ON public.gig_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can update their own rsvp"
      ON public.gig_rsvps FOR UPDATE
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can delete their own rsvp"
      ON public.gig_rsvps FOR DELETE USING (auth.uid() = user_id OR public.is_admin());
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    INSERT INTO public.users (id, name, generation) VALUES
      ('${admin}', '관리자', 40),
      ('${applicant}', '신청자', 41),
      ('${existing}', '기존 공연자', 39);
    INSERT INTO public.admins VALUES ('${admin}');
    INSERT INTO public.gigs VALUES (1, '테스트 공연');
    INSERT INTO public.gig_rsvps (gig_id, user_id, status, part, note) VALUES
      (1, '${applicant}', 'going', '기타', '늦게 도착'),
      (1, '${existing}', 'going', '드럼', '기존 비고');
    INSERT INTO public.performers (gig_id, user_id, part) VALUES (1, '${existing}', '드럼');
    INSERT INTO public.notifications
      (user_id, event_type, event_key, title, body, link, push_status)
    VALUES ('${admin}', 'member_approval_requested', 'legacy-1',
      '가입', '가입 요청', '/admin/members', 'skipped');
  `);
  await db.exec(migration);

  assert.equal((await one(`SELECT review_status FROM public.gig_rsvps WHERE user_id = '${existing}'`)).review_status, "approved");
  assert.equal((await one("SELECT link FROM public.notifications WHERE event_key = 'legacy-1'")).link, "/admin/approvals");

  const before = await one(`SELECT id, updated_at FROM public.gig_rsvps WHERE user_id = '${applicant}'`);
  await asUser(applicant);
  await assert.rejects(db.exec(`UPDATE public.gig_rsvps SET review_status = 'approved' WHERE id = ${before.id}`), /Only administrators/);
  await reset();

  await asUser(admin);
  assert.equal((await one(`SELECT public.review_gig_rsvp(1, ${before.id}, '${new Date(before.updated_at).toISOString()}', 'reject') AS reviewed`)).reviewed, true);
  assert.equal((await one(`SELECT public.review_gig_rsvp(1, ${before.id}, '${new Date(before.updated_at).toISOString()}', 'approve') AS reviewed`)).reviewed, false);
  await reset();
  const rejected = await one(`SELECT review_status, reviewed_at, reviewed_by, note
    FROM public.gig_rsvps WHERE id = ${before.id}`);
  assert.equal(rejected.review_status, "rejected");
  assert.equal(rejected.reviewed_by, admin);
  assert.ok(rejected.reviewed_at);
  assert.equal(rejected.note, "늦게 도착");

  await asUser(applicant);
  assert.equal((await db.query(`DELETE FROM public.gig_rsvps WHERE id = ${before.id}`)).affectedRows, 0);
  await db.exec(`UPDATE public.gig_rsvps SET note = '재신청 비고' WHERE id = ${before.id}`);
  await reset();
  assert.equal((await one(`SELECT review_status, reviewed_at FROM public.gig_rsvps WHERE id = ${before.id}`)).review_status, "pending");
  assert.equal((await one("SELECT count(*)::int AS count FROM public.notifications WHERE event_type = 'gig_rsvp_requested'")).count, 1);

  const reapplied = await one(`SELECT updated_at FROM public.gig_rsvps WHERE id = ${before.id}`);
  await asUser(admin);
  assert.equal((await one(`SELECT public.review_gig_rsvp(1, ${before.id}, '${new Date(reapplied.updated_at).toISOString()}', 'approve') AS reviewed`)).reviewed, true);
  await reset();
  assert.equal((await one(`SELECT review_status FROM public.gig_rsvps WHERE id = ${before.id}`)).review_status, "approved");
  assert.equal((await one(`SELECT count(*)::int AS count FROM public.performers WHERE user_id = '${applicant}'`)).count, 1);
  assert.equal((await one("SELECT count(*)::int AS count FROM public.notifications WHERE event_type = 'gig_rsvp_requested'")).count, 1);

  await asUser(applicant);
  assert.equal((await db.query(`DELETE FROM public.gig_rsvps WHERE id = ${before.id}`)).affectedRows, 0);
  await reset();
  await db.exec(`DELETE FROM public.performers WHERE user_id = '${applicant}'`);
  await db.exec("SELECT pg_sleep(0.01)");
  await asUser(applicant);
  await db.exec(`UPDATE public.gig_rsvps SET note = '다시 신청' WHERE id = ${before.id}`);
  await reset();
  assert.equal((await one(`SELECT review_status FROM public.gig_rsvps WHERE id = ${before.id}`)).review_status, "pending");
  assert.equal((await one("SELECT count(*)::int AS count FROM public.notifications WHERE event_type = 'gig_rsvp_requested'")).count, 2);

  await db.exec(`INSERT INTO public.performers (gig_id, user_id, part) VALUES (1, '${applicant}', '기타')`);
  assert.equal((await one(`SELECT review_status FROM public.gig_rsvps WHERE id = ${before.id}`)).review_status, "approved");
  console.log("Admin RSVP review SQL transitions passed in isolated PGlite.");
} finally {
  await db.close();
}
