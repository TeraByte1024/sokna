-- S02: remove the legacy webhook containing a plaintext service-role key.
-- The Next.js outbox sender remains responsible for push delivery.
-- This does NOT revoke the key: disable legacy API keys separately.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  legacy_trigger record;
BEGIN
  SELECT t.tgtype, t.tgisinternal, n.nspname AS function_schema,
    p.proname AS function_name, pg_get_triggerdef(t.oid) AS definition
  INTO legacy_trigger
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE t.tgrelid = 'public.notifications'::regclass
    AND t.tgname = 'new_notification';

  IF FOUND THEN
    IF legacy_trigger.tgisinternal OR legacy_trigger.tgtype <> 5
      OR legacy_trigger.function_schema <> 'supabase_functions'
      OR legacy_trigger.function_name <> 'http_request'
      OR position('/functions/v1/send-push' IN legacy_trigger.definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected new_notification trigger; inspect safely before removal';
    END IF;
    DROP TRIGGER new_notification ON public.notifications;
  END IF;
END $$;
COMMIT;
