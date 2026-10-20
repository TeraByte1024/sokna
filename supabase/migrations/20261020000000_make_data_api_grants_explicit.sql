BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Fail closed if this is not the expected, RLS-protected application schema.
-- Never compensate for a missing policy by exposing an unprotected table.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'admins', 'gig_rsvps', 'gigs', 'nomination_responses', 'nominations',
    'notifications', 'performers', 'photos', 'profiles', 'setlist_views',
    'setlists', 'users'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name
        AND c.relkind = 'r' AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Expected RLS-enabled public.% before granting API access', table_name;
    END IF;
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Public pages and the joins they use. Row visibility stays with existing RLS.
GRANT SELECT ON TABLE public.gigs, public.performers, public.setlists,
  public.nominations, public.photos, public.users TO anon;
-- The existing photos ALL policy reads admins.email even for public SELECT.
-- Its subquery needs table privileges; admins RLS still hides anonymous rows.
GRANT SELECT ON TABLE public.admins TO anon;

-- Administrators use authenticated sessions too; RLS still decides who writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admins, public.gig_rsvps,
  public.gigs, public.nomination_responses, public.nominations,
  public.performers, public.photos, public.profiles, public.setlists,
  public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.setlist_views TO authenticated;
-- Admin nomination notifications are inserted with the user's session.
-- Inbox read/delete and delivery state changes use the server service client.
GRANT SELECT, INSERT ON TABLE public.notifications TO authenticated;

GRANT SELECT ON TABLE public.users TO service_role;
GRANT SELECT, UPDATE, DELETE ON TABLE public.profiles, public.notifications
  TO service_role;

-- Serial defaults require sequence access independently of table grants.
-- Resolve owned sequences instead of depending on generated sequence names.
DO $$
DECLARE
  table_name text;
  sequence_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'gigs', 'gig_rsvps', 'performers', 'setlists', 'nominations', 'nomination_responses'
  ] LOOP
    sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
    IF sequence_name IS NOT NULL THEN
      EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated', sequence_name);
    END IF;
  END LOOP;
END;
$$;

-- Preserve existing object/default grants, policies, functions, triggers and data.
-- Supabase manages the default-grant rollout. Every future CREATE TABLE must
-- include its own explicit grants; this fixed allowlist does not cover it.
COMMIT;
