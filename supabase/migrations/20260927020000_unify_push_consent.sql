BEGIN;

-- Consent timestamps remain owned by users_track_marketing_opted_in_at.
-- Client-supplied timestamps and historical NULL values keep their existing rules.
REVOKE ALL ON FUNCTION public.set_marketing_opted_in_at() FROM PUBLIC, anon, authenticated;

-- Run only after a persisted opt-out transition. Keeping cleanup in the same
-- transaction makes consent, its timestamp, and all owned devices atomic for
-- profile edits, signup upserts, and trusted administrative writes alike.
CREATE FUNCTION public.delete_push_profiles_on_opt_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_push_profiles_on_opt_out() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER users_delete_push_profiles_on_opt_out
  AFTER UPDATE OF marketing_opt_in ON public.users
  FOR EACH ROW
  WHEN (OLD.marketing_opt_in IS TRUE AND NEW.marketing_opt_in IS FALSE)
  EXECUTE FUNCTION public.delete_push_profiles_on_opt_out();

COMMENT ON FUNCTION public.delete_push_profiles_on_opt_out() IS
  'Atomically removes an account''s registered devices after consent changes from true to false; unchanged consent and account rebindings preserve devices';

COMMIT;
