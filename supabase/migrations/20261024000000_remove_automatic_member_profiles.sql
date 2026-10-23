BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

-- Account creation is independent of a membership application. Existing member
-- rows and the application/approval notification triggers remain unchanged.
DO $$
DECLARE
  existing_trigger record;
BEGIN
  SELECT t.tgisinternal, t.tgtype, n.nspname AS function_schema, p.proname AS function_name
  INTO existing_trigger
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE t.tgrelid = 'auth.users'::regclass AND t.tgname = 'on_auth_user_created';

  IF FOUND THEN
    IF existing_trigger.tgisinternal OR existing_trigger.tgtype <> 5
      OR existing_trigger.function_schema <> 'public'
      OR existing_trigger.function_name <> 'handle_new_user' THEN
      RAISE EXCEPTION 'Unexpected on_auth_user_created trigger; inspect before removal';
    END IF;
    DROP TRIGGER on_auth_user_created ON auth.users;
  END IF;
END;
$$;

-- No CASCADE: an unexpected remaining dependency must stop this migration.
DROP FUNCTION IF EXISTS public.handle_new_user();
COMMIT;
