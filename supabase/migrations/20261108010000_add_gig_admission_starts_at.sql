BEGIN;

ALTER TABLE public.gigs
  ADD COLUMN admission_starts_at timestamptz,
  ADD CONSTRAINT gigs_admission_before_performance CHECK (
    admission_starts_at IS NULL OR CASE
      WHEN perform_date IS NOT NULL AND perform_time::text ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      THEN isfinite(admission_starts_at)
        AND admission_starts_at <= ((perform_date + perform_time::time) AT TIME ZONE 'Asia/Seoul')
      ELSE false
    END
  );

COMMIT;
