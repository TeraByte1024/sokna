ALTER TABLE public.gigs
ADD COLUMN nomination_deadline timestamptz;

COMMENT ON COLUMN public.gigs.nomination_deadline IS
  'Nomination submissions have no closing time when NULL.';
