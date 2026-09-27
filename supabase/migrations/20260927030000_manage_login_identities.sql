BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Preserve the exact existing administrators: do not reinterpret legacy email grants.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.admins IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.admins a
    LEFT JOIN auth.users u ON u.id = a.id
    WHERE u.id IS NULL OR a.email IS DISTINCT FROM u.email
  ) THEN
    RAISE EXCEPTION 'Administrator IDs and emails must match Auth users before this migration.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- A login method or representative email may change; authorization belongs to the account ID.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admins WHERE id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

CREATE FUNCTION public.sync_auth_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.users
  SET email = NEW.email
  WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;

  UPDATE public.admins
  SET email = NEW.email
  WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_auth_user_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER auth_users_sync_member_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.sync_auth_user_email();

-- Auth v2.188.1 checks identity count before its transaction. Serialize Google
-- deletes per account so simultaneous requests cannot remove the final method.
-- Automatic Google OAuth linking creates its replacement identity before removing
-- unconfirmed identities, so that flow retains a method and remains allowed.
CREATE FUNCTION public.protect_last_google_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
  v_email text;
  v_email_confirmed_at timestamptz;
BEGIN
  IF OLD.provider <> 'google' THEN
    RETURN OLD;
  END IF;

  SELECT deleted_at, email, email_confirmed_at
  INTO v_deleted_at, v_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = OLD.user_id
  FOR UPDATE;

  -- Hard deletion cascades after the parent disappears; soft deletion marks it.
  IF NOT FOUND OR v_deleted_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- This fresh statement runs after the parent lock, including after lock waits.
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities
    WHERE user_id = OLD.user_id AND id <> OLD.id
      AND (
        (provider = 'google' AND identity_data->'email_verified' IS DISTINCT FROM 'false'::jsonb)
        OR (provider = 'email' AND (
          identity_data->'email_verified' = 'true'::jsonb
          OR (v_email_confirmed_at IS NOT NULL
            AND jsonb_typeof(identity_data->'email') = 'string'
            AND identity_data->>'email' = v_email)
        ))
      )
  ) THEN
    RAISE EXCEPTION 'At least one login identity must remain.'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_last_google_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER auth_identities_protect_last_google
BEFORE DELETE ON auth.identities
FOR EACH ROW EXECUTE FUNCTION public.protect_last_google_identity();

COMMIT;
