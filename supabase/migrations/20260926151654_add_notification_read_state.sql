-- Add an inbox read marker without changing push-delivery fields or historical rows.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_user_created_id_idx
  ON public.notifications (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id) WHERE read_at IS NULL;

-- Existing RLS policies and client privileges remain unchanged. Authenticated
-- server actions update only read_at and explicitly filter by the verified user ID.

COMMENT ON COLUMN public.notifications.read_at IS
  'First inbox read time; NULL means unread. Independent of push transmission and display.';
