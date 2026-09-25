-- Record the time of each transition into marketing/push consent.
-- Existing consenting members have no reliable historical consent time, so they stay NULL.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS marketing_opted_in_at timestamptz;

COMMENT ON COLUMN public.users.marketing_opted_in_at IS
  'Time of the latest transition to marketing_opt_in = true; NULL when not consented or historically unknown';

CREATE OR REPLACE FUNCTION public.set_marketing_opted_in_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.marketing_opted_in_at := CASE WHEN NEW.marketing_opt_in THEN now() ELSE NULL END;
  ELSIF NEW.marketing_opt_in IS DISTINCT FROM OLD.marketing_opt_in THEN
    NEW.marketing_opted_in_at := CASE WHEN NEW.marketing_opt_in THEN now() ELSE NULL END;
  ELSE
    -- Preserve the recorded time on unrelated edits and reject client-supplied timestamps.
    NEW.marketing_opted_in_at := OLD.marketing_opted_in_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_track_marketing_opted_in_at ON public.users;

CREATE TRIGGER users_track_marketing_opted_in_at
  BEFORE INSERT OR UPDATE OF marketing_opt_in, marketing_opted_in_at
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_marketing_opted_in_at();
