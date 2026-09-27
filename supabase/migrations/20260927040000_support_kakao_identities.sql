BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Keep the previously applied UID authorization and email synchronization intact.
-- Both supported social providers must leave another usable login method.
CREATE FUNCTION public.protect_last_social_identity()
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
  IF OLD.provider NOT IN ('google', 'kakao') THEN
    RETURN OLD;
  END IF;

  SELECT deleted_at, email, email_confirmed_at
  INTO v_deleted_at, v_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = OLD.user_id
  FOR UPDATE;

  -- Account removal may cascade after the parent disappears or is soft deleted.
  IF NOT FOUND OR v_deleted_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- Recheck after acquiring the account lock, including after lock waits.
  -- Kakao v2.197.0 marks email_verified only when Kakao reports both a valid
  -- and verified email. Match JavaScript trim() whitespace for the email check.
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities
    WHERE user_id = OLD.user_id AND id <> OLD.id
      AND (
        (provider = 'google' AND identity_data->'email_verified' IS DISTINCT FROM 'false'::jsonb)
        OR (provider = 'kakao'
          AND identity_data->'email_verified' = 'true'::jsonb
          AND jsonb_typeof(identity_data->'email') = 'string'
          AND btrim(identity_data->>'email',
            U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> '')
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
REVOKE ALL ON FUNCTION public.protect_last_social_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER auth_identities_protect_last_google ON auth.identities;
CREATE TRIGGER auth_identities_protect_last_social
BEFORE DELETE ON auth.identities
FOR EACH ROW EXECUTE FUNCTION public.protect_last_social_identity();
DROP FUNCTION public.protect_last_google_identity();

COMMIT;
