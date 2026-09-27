BEGIN;

-- A valid Auth session is not membership: OAuth creates a pending profile
-- before the user submits an application. Approval remains valid when an
-- approved member later clears optional profile fields.
CREATE FUNCTION public.is_approved_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND status = 'approved'
  );
$$;
REVOKE ALL ON FUNCTION public.is_approved_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_member() TO anon, authenticated, service_role;

-- Own-profile RLS permits profile edits, but must not permit self-approval.
-- Keep the invoker identity so trusted Auth/admin SECURITY DEFINER functions
-- and service-role maintenance continue to work under their existing checks.
CREATE FUNCTION public.protect_member_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending' OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only administrators can approve membership.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR (NEW.status IS DISTINCT FROM OLD.status
        AND NOT (OLD.status = 'rejected' AND NEW.status = 'pending')) THEN
      RAISE EXCEPTION 'Only administrators can change membership approval.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_member_approval() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER users_protect_member_approval
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_member_approval();

ALTER POLICY "Gigs visibility read access" ON public.gigs
USING (
  visibility = 'public'
  OR (auth.uid() IS NOT NULL AND (
    public.is_admin() OR (visibility = 'members' AND public.is_approved_member())
  ))
);
ALTER POLICY "Gigs visibility read boundary" ON public.gigs
USING (
  visibility = 'public'
  OR (auth.uid() IS NOT NULL AND (
    public.is_admin() OR (visibility = 'members' AND public.is_approved_member())
  ))
);
COMMENT ON COLUMN public.gigs.visibility IS
  'private=administrators, members=approved members and administrators, public=everyone';

-- Existing restrictive SELECT policies on performers/setlists/nominations/
-- nomination_responses inherit the strengthened parent-gig boundary.
-- Keep RSVP SELECT/DELETE ownership policies: users can inspect and remove
-- their own old application even after losing approval or gig access.
CREATE POLICY "Approved members insert visible gig rsvps"
ON public.gig_rsvps AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin() OR public.is_approved_member())
  AND EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = gig_rsvps.gig_id)
);
CREATE POLICY "Approved members update visible gig rsvps"
ON public.gig_rsvps AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  (public.is_admin() OR public.is_approved_member())
  AND EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = gig_rsvps.gig_id)
)
WITH CHECK (
  (public.is_admin() OR public.is_approved_member())
  AND EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = gig_rsvps.gig_id)
);

CREATE POLICY "Approved members insert visible nomination responses"
ON public.nomination_responses AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin() OR public.is_approved_member())
  AND EXISTS (
    SELECT 1 FROM public.nominations
    WHERE nominations.id = nomination_responses.nomination_id
  )
);
CREATE POLICY "Approved members update visible nomination responses"
ON public.nomination_responses AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  (public.is_admin() OR public.is_approved_member())
  AND EXISTS (
    SELECT 1 FROM public.nominations
    WHERE nominations.id = nomination_responses.nomination_id
  )
)
WITH CHECK (
  (public.is_admin() OR public.is_approved_member())
  AND EXISTS (
    SELECT 1 FROM public.nominations
    WHERE nominations.id = nomination_responses.nomination_id
  )
);

COMMIT;
