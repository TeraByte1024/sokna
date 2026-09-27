-- Isolated PostgreSQL/PGlite only; synthetic fixtures, never production.
-- Run SETUP_BEFORE_MIGRATION in a fresh database, apply the existing consent
-- timestamp migration and membership approval guard, then apply
-- 20260927020000_unify_push_consent.sql and execute the rest of this file.
-- A reusable PGlite runner is tests/run-push-consent-sql.mjs.
/* SETUP_BEFORE_MIGRATION
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE public.users (
  id uuid PRIMARY KEY, name text, status text NOT NULL DEFAULT 'pending',
  approved_at timestamptz, marketing_opt_in boolean NOT NULL DEFAULT false
);
CREATE TABLE public.admins (id uuid PRIMARY KEY);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid());
$$;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, user_id uuid REFERENCES public.users(id),
  fcm_token text UNIQUE NOT NULL
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
CREATE POLICY users_select_policy ON public.users FOR SELECT
  USING (status = 'approved' OR auth.uid() = id OR public.is_admin());
CREATE POLICY users_insert_policy ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY users_update_policy ON public.users FOR UPDATE
  USING (auth.uid() = id OR public.is_admin()) WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY "Users can view own push profiles" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own push profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND marketing_opt_in = true
  ));
CREATE POLICY "Users can update own push profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND marketing_opt_in = true
  ));
CREATE POLICY "Users can delete own push profiles" ON public.profiles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- These predate timestamp tracking: their actual historical time is unknown.
INSERT INTO public.users (id, name, marketing_opt_in) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Legacy consenting', true),
  ('10000000-0000-4000-8000-000000000002', 'Current consenting', false),
  ('10000000-0000-4000-8000-000000000003', 'Nonconsenting rebound account', false),
  ('10000000-0000-4000-8000-000000000004', 'Foreign consenting', true),
  ('10000000-0000-4000-8000-000000000005', 'Rollback subject', false),
  ('10000000-0000-4000-8000-000000000009', 'Administrator', false);
INSERT INTO public.admins VALUES ('10000000-0000-4000-8000-000000000009');
INSERT INTO public.profiles VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'legacy-device-1'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'legacy-device-2'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'foreign-device'),
  ('20000000-0000-4000-8000-000000000004', NULL, 'detached-device');
END_SETUP_BEFORE_MIGRATION */

BEGIN;
SET LOCAL statement_timeout = '15s';
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.set_marketing_opted_in_at()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.set_marketing_opted_in_at()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.delete_push_profiles_on_opt_out()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.delete_push_profiles_on_opt_out()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Internal consent trigger functions are directly executable';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
-- Repeated opt-in, ordinary edits, and forged dates preserve legacy NULL.
UPDATE public.users SET marketing_opt_in = true, name = 'Legacy edited',
  marketing_opted_in_at = '2000-01-01' WHERE id = auth.uid();
UPDATE public.users SET name = 'Legacy renamed' WHERE id = auth.uid();
DO $$ BEGIN
  IF (SELECT marketing_opted_in_at FROM public.users WHERE id = auth.uid()) IS NOT NULL
    OR (SELECT count(*) FROM public.profiles WHERE user_id = auth.uid()) <> 2 THEN
    RAISE EXCEPTION 'Unchanged legacy consent changed its timestamp or removed devices';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
UPDATE public.users SET marketing_opt_in = true, marketing_opted_in_at = '2000-01-01' WHERE id = auth.uid();
INSERT INTO public.profiles VALUES
  ('20000000-0000-4000-8000-000000000005', auth.uid(), 'current-device');
DO $$
DECLARE v_time timestamptz;
BEGIN
  SELECT marketing_opted_in_at INTO v_time FROM public.users WHERE id = auth.uid();
  IF v_time IS DISTINCT FROM now() THEN RAISE EXCEPTION 'Opt-in did not use server time'; END IF;
  UPDATE public.users SET marketing_opt_in = true, marketing_opted_in_at = '2001-01-01' WHERE id = auth.uid();
  UPDATE public.users SET marketing_opted_in_at = NULL WHERE id = auth.uid();
  UPDATE public.users SET name = 'Current renamed' WHERE id = auth.uid();
  IF (SELECT marketing_opted_in_at FROM public.users WHERE id = auth.uid()) IS DISTINCT FROM v_time
    OR (SELECT count(*) FROM public.profiles WHERE user_id = auth.uid()) <> 1 THEN
    RAISE EXCEPTION 'Unchanged consent failed to preserve its timestamp and device';
  END IF;
END $$;

-- New inserts record consent only when the inserted user actually consents.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
INSERT INTO public.users (id, marketing_opt_in, marketing_opted_in_at) VALUES (auth.uid(), true, '2000-01-01');
DO $$ BEGIN
  IF (SELECT marketing_opted_in_at FROM public.users WHERE id = auth.uid()) IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'Consenting signup did not record server time';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000007', true);
INSERT INTO public.users (id, marketing_opt_in, marketing_opted_in_at) VALUES (auth.uid(), false, '2000-01-01');
DO $$ BEGIN
  IF (SELECT marketing_opted_in_at FROM public.users WHERE id = auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'Nonconsenting signup accepted a forged consent time';
  END IF;
END $$;

-- An ordinary member cannot revoke another account through users RLS.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE v_count integer;
BEGIN
  UPDATE public.users SET marketing_opt_in = false WHERE id = '10000000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Foreign consent was writable'; END IF;
  BEGIN
    UPDATE public.users SET marketing_opt_in = false, status = 'approved', approved_at = now() WHERE id = auth.uid();
    RAISE EXCEPTION 'Consent write bypassed membership approval protection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT (SELECT marketing_opt_in FROM public.users WHERE id = auth.uid())
    OR (SELECT count(*) FROM public.profiles WHERE user_id = auth.uid()) <> 2 THEN
    RAISE EXCEPTION 'Rejected approval changed consent or deleted devices';
  END IF;
END $$;
-- DELETE is intentionally unavailable to this caller: cleanup must still work
-- through the narrowly scoped SECURITY DEFINER trigger and only for this owner.
RESET ROLE;
REVOKE DELETE ON public.profiles FROM authenticated;
SET LOCAL ROLE authenticated;
UPDATE public.users SET marketing_opt_in = false, marketing_opted_in_at = '2000-01-01' WHERE id = auth.uid();
DO $$ BEGIN
  IF (SELECT marketing_opt_in OR marketing_opted_in_at IS NOT NULL FROM public.users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Own opt-out was not atomic with timestamp/device cleanup';
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE fcm_token IN ('foreign-device', 'current-device', 'detached-device')) <> 3
    OR NOT (SELECT marketing_opt_in FROM public.users WHERE id = '10000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'Opt-out affected a foreign or detached device/account';
  END IF;
END $$;

-- Account switching may bind an existing device to a nonconsenting account.
-- Merely saving unchanged false consent must preserve that registration.
SET LOCAL ROLE service_role;
UPDATE public.profiles SET user_id = '10000000-0000-4000-8000-000000000003'
  WHERE fcm_token = 'detached-device';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
UPDATE public.users SET marketing_opt_in = false, name = 'Rebound edited' WHERE id = auth.uid();
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE user_id = auth.uid()) <> 1 THEN
    RAISE EXCEPTION 'Unchanged false consent deleted a rebound device';
  END IF;
END $$;

-- Signup ON CONFLICT runs both INSERT and UPDATE triggers. Only its persisted
-- transition may remove devices; unchanged true also preserves legacy NULL.
RESET ROLE;
INSERT INTO public.users (id, marketing_opt_in) VALUES ('10000000-0000-4000-8000-000000000004', true)
  ON CONFLICT (id) DO UPDATE SET marketing_opt_in = EXCLUDED.marketing_opt_in;
DO $$ BEGIN
  IF (SELECT marketing_opted_in_at FROM public.users WHERE id = '10000000-0000-4000-8000-000000000004') IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE fcm_token = 'foreign-device') THEN
    RAISE EXCEPTION 'Unchanged signup upsert lost legacy time/device semantics';
  END IF;
END $$;
INSERT INTO public.users (id, marketing_opt_in) VALUES ('10000000-0000-4000-8000-000000000004', false)
  ON CONFLICT (id) DO UPDATE SET marketing_opt_in = EXCLUDED.marketing_opt_in;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE fcm_token = 'foreign-device') THEN
    RAISE EXCEPTION 'Signup upsert opt-out did not delete the account device';
  END IF;
END $$;

-- Deletion failures and later user-trigger failures must roll back everything.
UPDATE public.users SET marketing_opt_in = true WHERE id = '10000000-0000-4000-8000-000000000005';
INSERT INTO public.profiles VALUES
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'rollback-device-1'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', 'rollback-device-2');
CREATE FUNCTION public.test_reject_device_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic device failure' USING ERRCODE = 'P9001'; END;
$$;
CREATE TRIGGER test_reject_device_delete BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.test_reject_device_delete();
DO $$
DECLARE v_time timestamptz;
BEGIN
  SELECT marketing_opted_in_at INTO v_time FROM public.users WHERE id = '10000000-0000-4000-8000-000000000005';
  BEGIN
    UPDATE public.users SET marketing_opt_in = false WHERE id = '10000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'Expected device deletion failure';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL; END;
  IF (SELECT marketing_opt_in AND marketing_opted_in_at = v_time FROM public.users WHERE id = '10000000-0000-4000-8000-000000000005') IS DISTINCT FROM true
    OR (SELECT count(*) FROM public.profiles WHERE user_id = '10000000-0000-4000-8000-000000000005') <> 2 THEN
    RAISE EXCEPTION 'Failed device deletion did not roll back consent/time/devices';
  END IF;
END $$;
DROP TRIGGER test_reject_device_delete ON public.profiles;
CREATE FUNCTION public.test_reject_user_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic late user failure' USING ERRCODE = 'P9002'; END;
$$;
CREATE TRIGGER users_zz_test_reject AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.test_reject_user_write();
DO $$
DECLARE v_time timestamptz;
BEGIN
  SELECT marketing_opted_in_at INTO v_time FROM public.users WHERE id = '10000000-0000-4000-8000-000000000005';
  BEGIN
    UPDATE public.users SET marketing_opt_in = false WHERE id = '10000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'Expected late user failure';
  EXCEPTION WHEN SQLSTATE 'P9002' THEN NULL; END;
  IF (SELECT marketing_opt_in AND marketing_opted_in_at = v_time FROM public.users WHERE id = '10000000-0000-4000-8000-000000000005') IS DISTINCT FROM true
    OR (SELECT count(*) FROM public.profiles WHERE user_id = '10000000-0000-4000-8000-000000000005') <> 2 THEN
    RAISE EXCEPTION 'Later user failure did not restore consent/time/deleted devices';
  END IF;
END $$;
DROP TRIGGER users_zz_test_reject ON public.users;

-- A suppressed BEFORE update is not a persisted revocation.
CREATE FUNCTION public.test_suppress_user_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NULL; END;
$$;
CREATE TRIGGER users_zz_test_suppress BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.test_suppress_user_write();
UPDATE public.users SET marketing_opt_in = false WHERE id = '10000000-0000-4000-8000-000000000005';
DO $$ BEGIN
  IF NOT (SELECT marketing_opt_in FROM public.users WHERE id = '10000000-0000-4000-8000-000000000005')
    OR (SELECT count(*) FROM public.profiles WHERE user_id = '10000000-0000-4000-8000-000000000005') <> 2 THEN
    RAISE EXCEPTION 'Suppressed user write removed devices';
  END IF;
END $$;
DROP TRIGGER users_zz_test_suppress ON public.users;

-- Authorized administrator edits also use the same atomic cleanup.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000009', true);
UPDATE public.users SET marketing_opt_in = false WHERE id = '10000000-0000-4000-8000-000000000005';
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '10000000-0000-4000-8000-000000000005')
    OR (SELECT marketing_opt_in OR marketing_opted_in_at IS NOT NULL FROM public.users WHERE id = '10000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'Administrator opt-out skipped atomic cleanup';
  END IF;
END $$;
-- Service-role maintenance follows the same rule; re-consent records a time
-- without silently recreating the devices that were explicitly revoked.
SET LOCAL ROLE service_role;
UPDATE public.users SET marketing_opt_in = false WHERE id = '10000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '10000000-0000-4000-8000-000000000002')
    OR (SELECT marketing_opt_in OR marketing_opted_in_at IS NOT NULL FROM public.users WHERE id = '10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Service-role opt-out skipped atomic cleanup';
  END IF;
END $$;
UPDATE public.users SET marketing_opt_in = true WHERE id = '10000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF (SELECT marketing_opt_in AND marketing_opted_in_at = now() FROM public.users WHERE id = '10000000-0000-4000-8000-000000000002') IS DISTINCT FROM true
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Re-consent failed to record a timestamp or recreated devices';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
