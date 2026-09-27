-- Isolated PostgreSQL/PGlite only. Execute SETUP_BEFORE_MIGRATION in a fresh
-- database, apply 20260927010000_require_approved_gig_membership.sql, then run
-- the rest of this file. All fixtures are synthetic; never use production.
/* SETUP_BEFORE_MIGRATION
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE public.users (
  id uuid PRIMARY KEY, name text, email text, generation integer, part text,
  status text NOT NULL DEFAULT 'pending', applied_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz, marketing_opt_in boolean NOT NULL DEFAULT false
);
CREATE TABLE public.admins (id uuid PRIMARY KEY);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE id = auth.uid());
$$;
CREATE TABLE public.gigs (id bigint PRIMARY KEY, title text, visibility text NOT NULL);
CREATE TABLE public.performers (id bigint PRIMARY KEY, gig_id bigint REFERENCES public.gigs,
  user_id uuid REFERENCES public.users, name text);
CREATE TABLE public.setlists (id bigint PRIMARY KEY, gig_id bigint REFERENCES public.gigs, title text);
CREATE TABLE public.nominations (id bigint PRIMARY KEY, gig_id bigint REFERENCES public.gigs, title text);
CREATE TABLE public.nomination_responses (id bigint PRIMARY KEY, nomination_id bigint REFERENCES public.nominations,
  user_id uuid REFERENCES public.users, status text DEFAULT 'undecided');
CREATE TABLE public.gig_rsvps (id bigint PRIMARY KEY, gig_id bigint REFERENCES public.gigs,
  user_id uuid REFERENCES public.users, status text DEFAULT 'going', note text);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomination_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_rsvps ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
CREATE POLICY users_select_policy ON public.users FOR SELECT
  USING (status = 'approved' OR auth.uid() = id OR public.is_admin());
CREATE POLICY users_insert_policy ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY users_update_policy ON public.users FOR UPDATE
  USING (auth.uid() = id OR public.is_admin()) WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY "Gigs visibility read access" ON public.gigs FOR SELECT TO anon, authenticated
  USING (visibility = 'public' OR (auth.uid() IS NOT NULL AND (visibility = 'members' OR public.is_admin())));
CREATE POLICY "Gigs visibility read boundary" ON public.gigs AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (visibility = 'public' OR (auth.uid() IS NOT NULL AND (visibility = 'members' OR public.is_admin())));
-- Deliberately retain an old broad permissive policy to test the boundary.
CREATE POLICY "Legacy gigs read access" ON public.gigs FOR SELECT USING (true);
CREATE POLICY "Admins manage gigs" ON public.gigs FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Performers select policy" ON public.performers FOR SELECT USING (true);
CREATE POLICY "Performers gig visibility boundary" ON public.performers AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = performers.gig_id));
CREATE POLICY "Setlists select policy" ON public.setlists FOR SELECT USING (true);
CREATE POLICY "Setlists gig visibility boundary" ON public.setlists AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = setlists.gig_id));
CREATE POLICY "Nominations select policy" ON public.nominations FOR SELECT USING (true);
CREATE POLICY "Nominations gig visibility boundary" ON public.nominations AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = nominations.gig_id));
CREATE POLICY "Authenticated users can select nomination responses" ON public.nomination_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Nomination responses gig visibility boundary" ON public.nomination_responses AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.nominations WHERE nominations.id = nomination_responses.nomination_id));
CREATE POLICY "Users can insert own nomination responses" ON public.nomination_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own nomination responses" ON public.nomination_responses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can delete own nomination responses" ON public.nomination_responses FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can view their own rsvp or admins view all" ON public.gig_rsvps FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can insert their own rsvp" ON public.gig_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own rsvp" ON public.gig_rsvps FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own rsvp" ON public.gig_rsvps FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin());
INSERT INTO public.users (id, name, generation, part, status) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Approved', 40, 'Guitar', 'approved'),
  ('10000000-0000-4000-8000-000000000002', 'Pending complete', 40, 'Guitar', 'pending'),
  ('10000000-0000-4000-8000-000000000003', 'OAuth only', NULL, NULL, 'pending'),
  ('10000000-0000-4000-8000-000000000004', 'Rejected', 40, 'Guitar', 'rejected'),
  ('10000000-0000-4000-8000-000000000005', 'Approved optional part', 40, NULL, 'approved'),
  ('10000000-0000-4000-8000-000000000006', 'Pending administrator', NULL, NULL, 'pending');
INSERT INTO public.admins VALUES ('10000000-0000-4000-8000-000000000006');
INSERT INTO public.gigs VALUES (1, 'Public', 'public'), (2, 'Members', 'members'), (3, 'Private', 'private');
INSERT INTO public.performers SELECT id, id, '10000000-0000-4000-8000-000000000001'::uuid, 'Performer' FROM public.gigs;
INSERT INTO public.setlists SELECT id, id, 'Setlist' FROM public.gigs;
INSERT INTO public.nominations SELECT id, id, 'Nomination' FROM public.gigs;
INSERT INTO public.nomination_responses SELECT id, id, '10000000-0000-4000-8000-000000000001'::uuid, 'undecided' FROM public.gigs;
INSERT INTO public.nomination_responses VALUES (10, 1, '10000000-0000-4000-8000-000000000002', 'undecided');
INSERT INTO public.gig_rsvps SELECT 100 + id, id, '10000000-0000-4000-8000-000000000002'::uuid, 'going', 'Original' FROM public.gigs;
INSERT INTO public.gig_rsvps SELECT 200 + id, id, '10000000-0000-4000-8000-000000000001'::uuid, 'going', 'Original' FROM public.gigs;
-- Reproduce trusted existing RPC/Auth trigger execution without external Auth.
CREATE FUNCTION public.test_trusted_profile_write(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.users (id, name, status, approved_at) VALUES (p_id, 'Trusted', 'approved', now());
$$;
REVOKE ALL ON FUNCTION public.test_trusted_profile_write(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_trusted_profile_write(uuid) TO authenticated;
END_SETUP_BEFORE_MIGRATION */

BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN
  IF (SELECT array_agg(id ORDER BY id) FROM public.gigs) IS DISTINCT FROM ARRAY[1::bigint]
    OR (SELECT count(*) FROM public.performers) <> 1
    OR (SELECT count(*) FROM public.setlists) <> 1
    OR (SELECT count(*) FROM public.nominations) <> 1
    OR EXISTS (SELECT 1 FROM public.nomination_responses) THEN
    RAISE EXCEPTION 'Anonymous reads bypassed the public boundary';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE v_suffix integer;
BEGIN
  -- Complete pending, OAuth-only, rejected and missing profiles all stay public-only.
  FOREACH v_suffix IN ARRAY ARRAY[2, 3, 4, 7] LOOP
    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-' || lpad(v_suffix::text, 12, '0'), true);
    IF public.is_approved_member()
      OR (SELECT array_agg(id ORDER BY id) FROM public.gigs) IS DISTINCT FROM ARRAY[1::bigint]
      OR (SELECT count(*) FROM public.performers) <> 1
      OR (SELECT count(*) FROM public.setlists) <> 1
      OR (SELECT count(*) FROM public.nominations) <> 1
      OR EXISTS (SELECT 1 FROM public.nomination_responses WHERE nomination_id <> 1) THEN
      RAISE EXCEPTION 'Unapproved profile % read a member/private gig or child', v_suffix;
    END IF;
  END LOOP;
  FOREACH v_suffix IN ARRAY ARRAY[1, 5] LOOP
    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-' || lpad(v_suffix::text, 12, '0'), true);
    IF NOT public.is_approved_member()
      OR (SELECT array_agg(id ORDER BY id) FROM public.gigs) IS DISTINCT FROM ARRAY[1::bigint, 2::bigint]
      OR (SELECT count(*) FROM public.performers) <> 2
      OR (SELECT count(*) FROM public.setlists) <> 2
      OR (SELECT count(*) FROM public.nominations) <> 2
      OR EXISTS (SELECT 1 FROM public.nomination_responses WHERE nomination_id = 3) THEN
      RAISE EXCEPTION 'Approved profile % has incorrect parent/child access', v_suffix;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
  IF public.is_approved_member() OR (SELECT count(*) FROM public.gigs) <> 3
    OR (SELECT count(*) FROM public.performers) <> 3 OR (SELECT count(*) FROM public.setlists) <> 3
    OR (SELECT count(*) FROM public.nominations) <> 3
    OR (SELECT count(*) FROM public.nomination_responses) <> 4 THEN
    RAISE EXCEPTION 'Administrator exception requires profile approval';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
DO $$
DECLARE v_count integer;
BEGIN
  BEGIN
    UPDATE public.users SET status = 'approved' WHERE id = auth.uid();
    RAISE EXCEPTION 'Self-approval unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.users SET approved_at = now() WHERE id = auth.uid();
    RAISE EXCEPTION 'Forged approval timestamp unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.users (id, status) VALUES (auth.uid(), 'approved')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
    RAISE EXCEPTION 'Upsert self-approval unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- The real completion action uses pending-profile upsert.
  INSERT INTO public.users (id, name, generation, part, status, applied_at)
    VALUES (auth.uid(), 'Updated application', 41, 'Bass', 'pending', now())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, generation = EXCLUDED.generation,
      part = EXCLUDED.part, status = EXCLUDED.status, applied_at = EXCLUDED.applied_at;
  IF (SELECT name FROM public.users WHERE id = auth.uid()) <> 'Updated application' THEN
    RAISE EXCEPTION 'Pending profile completion stopped working';
  END IF;
  BEGIN
    INSERT INTO public.gig_rsvps (id, gig_id, user_id) VALUES (901, 1, auth.uid());
    RAISE EXCEPTION 'Pending member inserted an RSVP for a public gig';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.nomination_responses (id, nomination_id, user_id) VALUES (901, 1, auth.uid());
    RAISE EXCEPTION 'Pending member inserted a nomination response';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.gig_rsvps SET note = 'Unauthorized' WHERE user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending member updated an RSVP'; END IF;
  UPDATE public.nomination_responses SET status = 'available' WHERE id = 10;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Pending member updated a nomination response'; END IF;
  IF (SELECT count(*) FROM public.gig_rsvps) <> 3 THEN
    RAISE EXCEPTION 'Own past RSVP records are no longer available for cleanup';
  END IF;
  DELETE FROM public.gig_rsvps WHERE id = 103;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Own private-gig RSVP cleanup stopped working'; END IF;
  DELETE FROM public.nomination_responses WHERE id = 10;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Own visible nomination-response cleanup stopped working'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000008', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.users (id, status) VALUES (auth.uid(), 'approved');
    RAISE EXCEPTION 'New profile self-approval unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.users (id, approved_at) VALUES (auth.uid(), now());
    RAISE EXCEPTION 'New profile forged an approval timestamp';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.users (id, name, status) VALUES (auth.uid(), 'New pending', 'pending');
END $$;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
UPDATE public.users SET status = 'pending', applied_at = now() WHERE id = auth.uid();
DO $$ BEGIN
  IF (SELECT status FROM public.users WHERE id = auth.uid()) <> 'pending' THEN
    RAISE EXCEPTION 'Rejected application cannot be resubmitted';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE v_count integer;
BEGIN
  BEGIN
    UPDATE public.users SET status = 'pending' WHERE id = auth.uid();
    RAISE EXCEPTION 'Approved member changed their own approval state';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.users SET part = NULL WHERE id = auth.uid();
  IF NOT public.is_approved_member() THEN RAISE EXCEPTION 'Optional profile edit removed membership'; END IF;
  INSERT INTO public.gig_rsvps (id, gig_id, user_id) VALUES (901, 2, auth.uid());
  UPDATE public.gig_rsvps SET note = 'Allowed' WHERE id = 901;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Approved member cannot update an accessible RSVP'; END IF;
  BEGIN
    INSERT INTO public.gig_rsvps (id, gig_id, user_id) VALUES (902, 3, auth.uid());
    RAISE EXCEPTION 'Approved member inserted a private-gig RSVP';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.gig_rsvps SET gig_id = 3 WHERE id = 901;
    RAISE EXCEPTION 'RSVP moved to an inaccessible gig';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.gig_rsvps SET note = 'Unauthorized' WHERE id = 203;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Private-gig RSVP updated'; END IF;
  INSERT INTO public.nomination_responses (id, nomination_id, user_id) VALUES (901, 2, auth.uid());
  UPDATE public.nomination_responses SET status = 'available' WHERE id = 901;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Approved member cannot update an accessible response'; END IF;
  BEGIN
    INSERT INTO public.nomination_responses (id, nomination_id, user_id) VALUES (902, 3, auth.uid());
    RAISE EXCEPTION 'Approved member inserted a private-gig response';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.nomination_responses SET nomination_id = 3 WHERE id = 901;
    RAISE EXCEPTION 'Response moved to an inaccessible nomination';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
UPDATE public.users SET status = 'approved', approved_at = now()
WHERE id = '10000000-0000-4000-8000-000000000002';
INSERT INTO public.gig_rsvps (id, gig_id, user_id) VALUES (903, 3, auth.uid());
INSERT INTO public.nomination_responses (id, nomination_id, user_id) VALUES (903, 3, auth.uid());
SELECT public.test_trusted_profile_write('10000000-0000-4000-8000-000000000009');
SET LOCAL ROLE service_role;
INSERT INTO public.users (id, status, approved_at)
VALUES ('10000000-0000-4000-8000-000000000010', 'approved', now());
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.users WHERE id IN (
    '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000010') AND status = 'approved' AND approved_at IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'Administrator, trusted function or service-role approval stopped working';
  END IF;
END $$;
ROLLBACK;
