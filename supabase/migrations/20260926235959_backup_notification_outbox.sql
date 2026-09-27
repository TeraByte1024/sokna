-- Restricted recovery snapshot for the destructive notification schema handoff.
-- This stays on the same database; it is not a full project/disaster-recovery backup.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.users, public.nominations, public.gig_notification_queue,
  public.notifications IN SHARE ROW EXCLUSIVE MODE;

CREATE SCHEMA sokna_migration_backup_20260927;
REVOKE ALL ON SCHEMA sokna_migration_backup_20260927
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE sokna_migration_backup_20260927.notifications AS TABLE public.notifications;
CREATE TABLE sokna_migration_backup_20260927.gig_notification_queue AS TABLE public.gig_notification_queue;
CREATE TABLE sokna_migration_backup_20260927.function_definitions AS
SELECT p.oid::regprocedure::text AS signature,
  pg_get_functiondef(p.oid) AS definition,
  p.proacl::text AS privileges,
  pg_get_userbyid(p.proowner) AS owner_name
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('handle_new_user', 'approve_member_with_notification');

CREATE TABLE sokna_migration_backup_20260927.metadata AS
SELECT now() AS captured_at,
  '20260927000000_simplify_notification_outbox'::text AS migration,
  (SELECT count(*) FROM public.notifications) AS notification_count,
  (SELECT count(*) FROM public.gig_notification_queue) AS queue_count,
  (SELECT jsonb_agg(to_jsonb(c)) FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name IN ('notifications', 'gig_notification_queue')) AS columns,
  (SELECT jsonb_agg(jsonb_build_object('table', conrelid::regclass::text,
    'name', conname, 'definition', pg_get_constraintdef(oid))) FROM pg_constraint
    WHERE conrelid IN ('public.notifications'::regclass, 'public.gig_notification_queue'::regclass)) AS constraints,
  (SELECT jsonb_agg(to_jsonb(i)) FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.tablename IN ('notifications', 'gig_notification_queue')) AS indexes,
  (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename IN ('notifications', 'gig_notification_queue')) AS policies,
  (SELECT jsonb_agg(to_jsonb(g)) FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public' AND g.table_name IN ('notifications', 'gig_notification_queue')) AS grants;

REVOKE ALL ON ALL TABLES IN SCHEMA sokna_migration_backup_20260927
  FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE sokna_migration_backup_20260927.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sokna_migration_backup_20260927.gig_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sokna_migration_backup_20260927.function_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sokna_migration_backup_20260927.metadata ENABLE ROW LEVEL SECURITY;

COMMENT ON SCHEMA sokna_migration_backup_20260927 IS
  'Restricted notification cutover recovery snapshot. Not an application archive or independent backup. Remove after deployment and data-preservation verification.';
COMMIT;
