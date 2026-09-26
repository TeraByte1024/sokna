-- The account inbox is also the only durable push outbox.
-- Apply with the matching application release: the old push_eligible/processing
-- contract and the intermediate nomination queue are retired together.
BEGIN;

-- Prevent business writes and an old queue worker from straddling the handoff.
LOCK TABLE public.users, public.nominations, public.gig_notification_queue,
  public.notifications IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.notifications
  ADD COLUMN event_type text NOT NULL DEFAULT 'legacy',
  ADD COLUMN event_key text,
  ADD COLUMN push_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN push_next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN push_progress jsonb NOT NULL DEFAULT '{"successfulProfileIds":[],"failures":[]}'::jsonb;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_push_status_check;
DROP INDEX IF EXISTS public.idx_notifications_push_pending;

-- Older releases encoded the entire checkpoint in push_error. Preserve device
-- successes and permanent failures so a schema upgrade cannot resend them.
DO $$
DECLARE
  v_row record;
  v_checkpoint jsonb;
  v_progress jsonb;
  v_attempts integer;
  v_next timestamptz;
  v_reason text;
  v_status text;
BEGIN
  FOR v_row IN SELECT * FROM public.notifications LOOP
    v_checkpoint := NULL;
    BEGIN
      v_checkpoint := v_row.push_error::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      v_checkpoint := NULL;
    END;

    v_progress := '{"successfulProfileIds":[],"failures":[]}'::jsonb;
    v_attempts := 0;
    v_next := COALESCE(v_row.push_attempted_at + interval '1 minute', v_row.created_at);
    v_reason := v_row.push_error;
    IF jsonb_typeof(v_checkpoint) = 'object' AND v_checkpoint->>'version' = '1'
      AND jsonb_typeof(v_checkpoint->'successfulProfileIds') = 'array'
      AND jsonb_typeof(v_checkpoint->'failures') = 'array' THEN
      v_progress := jsonb_build_object(
        'successfulProfileIds', v_checkpoint->'successfulProfileIds',
        'failures', v_checkpoint->'failures'
      );
      v_reason := v_checkpoint->>'reason';
      IF COALESCE(v_checkpoint->>'attempts', '') ~ '^[0-9]+$' THEN
        v_attempts := LEAST((v_checkpoint->>'attempts')::numeric, 2147483647)::integer;
      END IF;
      BEGIN
        v_next := COALESCE((v_checkpoint->>'nextAttemptAt')::timestamptz, v_next);
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        NULL;
      END;
    END IF;

    -- Old releases stored provider messages; never carry those details into the code field.
    IF v_reason IS NOT NULL AND v_reason !~ '^[a-zA-Z0-9_/-]{1,100}$' THEN
      v_reason := 'legacy_error';
    END IF;

    v_status := CASE v_row.push_status WHEN 'sent' THEN 'accepted'
      WHEN 'processing' THEN 'pending' ELSE v_row.push_status END;
    IF v_row.push_status = 'processing' THEN
      v_next := GREATEST(v_next, COALESCE(v_row.push_attempted_at, now()) + interval '5 minutes');
    END IF;
    IF NOT v_row.push_eligible AND v_status = 'pending' THEN
      v_status := 'skipped';
      v_reason := COALESCE(v_reason, 'not_eligible');
    END IF;

    UPDATE public.notifications SET
      event_type = CASE
        WHEN title IN ('신규 회원가입 승인 요청', '신규 회원가입 승인 요청 (Google)') THEN 'member_approval_requested'
        WHEN title = '회원가입 승인 완료' THEN 'member_approved'
        ELSE 'legacy' END,
      event_key = 'legacy:' || id::text,
      push_status = v_status,
      push_attempts = v_attempts,
      push_next_attempt_at = v_next,
      push_progress = v_progress,
      push_error = v_reason
    WHERE id = v_row.id;
  END LOOP;
END $$;

ALTER TABLE public.notifications
  ALTER COLUMN push_status SET DEFAULT 'skipped',
  ALTER COLUMN event_key SET NOT NULL,
  ALTER COLUMN event_key SET DEFAULT gen_random_uuid()::text,
  DROP COLUMN push_eligible,
  ADD CONSTRAINT notifications_event_type_check CHECK
    (event_type IN ('member_approval_requested', 'member_approved', 'nomination_added', 'legacy')),
  ADD CONSTRAINT notifications_push_status_check CHECK
    (push_status IN ('pending', 'accepted', 'skipped', 'failed')),
  ADD CONSTRAINT notifications_push_attempts_check CHECK (push_attempts >= 0),
  ADD CONSTRAINT notifications_push_progress_check CHECK
    ((jsonb_typeof(push_progress) = 'object'
      AND jsonb_typeof(push_progress->'successfulProfileIds') = 'array'
      AND jsonb_typeof(push_progress->'failures') = 'array') IS TRUE),
  ADD CONSTRAINT notifications_user_event_key UNIQUE (user_id, event_type, event_key);

CREATE INDEX notifications_push_due_idx
  ON public.notifications (push_next_attempt_at, created_at, id)
  WHERE push_status = 'pending';

-- One message definition for each event. Only trusted database entry points may
-- create notifications; neither recipients nor caller-provided text are exposed
-- through an authenticated RPC. The stored text remains an immutable snapshot.
CREATE OR REPLACE FUNCTION public.create_app_notification(
  p_user_id uuid,
  p_event_type text,
  p_event_key text,
  p_context jsonb,
  p_notification_id uuid DEFAULT gen_random_uuid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title text;
  v_body text;
  v_link text;
  v_id uuid;
BEGIN
  IF p_event_key IS NULL OR btrim(p_event_key) = '' THEN
    RAISE EXCEPTION '알림 이벤트 키가 필요합니다.' USING ERRCODE = '22023';
  END IF;

  CASE p_event_type
    WHEN 'member_approval_requested' THEN
      v_title := '신규 회원가입 승인 요청';
      v_body := format('%s (%s기, %s)님이 가입 승인을 요청했습니다.',
        p_context->>'name', p_context->>'generation', p_context->>'part');
      v_link := '/admin/members';
    WHEN 'member_approved' THEN
      v_title := '회원가입 승인 완료';
      v_body := '소리로 크는 나무(소크나)의 정식 회원으로 승인되었습니다. 환영합니다!';
      v_link := '/members';
    WHEN 'nomination_added' THEN
      v_title := format('[%s] 선곡회의 새 후보곡 등록', COALESCE(NULLIF(p_context->>'gig_title', ''), '공연'));
      v_body := COALESCE(NULLIF(p_context->>'song_titles', ''), '새로운 후보곡')
        || '이(가) 등록되었습니다. 참여 가능한 세션에 응답해주세요!';
      v_link := '/gigs/' || (p_context->>'gig_id') || '/nominations';
    ELSE
      RAISE EXCEPTION '지원하지 않는 알림 종류입니다.' USING ERRCODE = '22023';
  END CASE;

  INSERT INTO public.notifications (
    id, user_id, event_type, event_key, title, body, link,
    push_status, push_error
  )
  SELECT p_notification_id, u.id, p_event_type, p_event_key,
    v_title, v_body, v_link,
    CASE WHEN u.marketing_opt_in THEN 'pending' ELSE 'skipped' END,
    CASE WHEN u.marketing_opt_in THEN NULL ELSE 'not_opted_in' END
  FROM public.users u WHERE u.id = p_user_id
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.notifications
    WHERE user_id = p_user_id AND event_type = p_event_type AND event_key = p_event_key;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_app_notification(uuid, text, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_member_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin record;
  v_context jsonb;
  v_event_key text;
BEGIN
  IF NEW.status <> 'pending' OR NEW.generation IS NULL OR NEW.generation < 1
    OR NULLIF(btrim(NEW.name), '') IS NULL OR NULLIF(btrim(NEW.part), '') IS NULL THEN
    RETURN NEW;
  END IF;
  -- Profile edits/repeated submissions of an already complete application do
  -- not create a second approval request. A new rejected -> pending round does.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND OLD.generation >= 1
      AND NULLIF(btrim(OLD.name), '') IS NOT NULL
      AND NULLIF(btrim(OLD.part), '') IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  v_event_key := 'member-application:' || NEW.id::text || ':'
    || to_char(NEW.applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_context := jsonb_build_object('name', NEW.name, 'generation', NEW.generation, 'part', NEW.part);
  FOR v_admin IN SELECT a.id FROM public.admins a JOIN public.users u ON u.id = a.id LOOP
    PERFORM public.create_app_notification(v_admin.id, 'member_approval_requested', v_event_key, v_context);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_member_application() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER users_notify_member_application
  AFTER INSERT OR UPDATE OF status, name, generation, part, applied_at ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_member_application();

-- Auth creation only creates the member profile. The users trigger owns both
-- email and completed social applications, including their message templates.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_gen integer;
  v_part text;
  v_marketing boolean;
BEGIN
  v_name := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1));
  BEGIN
    v_gen := NULLIF(btrim(NEW.raw_user_meta_data->>'generation'), '')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_gen := NULL;
  END;
  v_part := NULLIF(btrim(NEW.raw_user_meta_data->>'part'), '');
  v_marketing := COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false);

  INSERT INTO public.users (id, name, generation, part, email, status, applied_at, marketing_opt_in)
  VALUES (NEW.id, v_name, v_gen, v_part, NEW.email, 'pending', now(), v_marketing)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = CASE WHEN public.users.name = '' OR public.users.name IS NULL THEN EXCLUDED.name ELSE public.users.name END,
    generation = COALESCE(public.users.generation, EXCLUDED.generation),
    part = COALESCE(public.users.part, EXCLUDED.part),
    marketing_opt_in = EXCLUDED.marketing_opt_in;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_member_with_notification(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF NOT COALESCE(public.is_admin(), false) THEN
    RAISE EXCEPTION '관리자만 회원을 승인할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users SET status = 'approved', approved_at = v_now
  WHERE id = p_user_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;

  PERFORM public.create_app_notification(p_user_id, 'member_approved',
    'member-approved:' || p_user_id::text || ':'
      || to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '{}'::jsonb);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_member_with_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_member_with_notification(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_nomination_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_gig_title text;
  v_recipient record;
  v_context jsonb;
BEGIN
  IF v_actor IS NULL THEN
    SELECT user_id INTO v_actor FROM public.performers
    WHERE id = NEW.created_by AND gig_id = NEW.gig_id;
  END IF;
  SELECT title INTO v_gig_title FROM public.gigs WHERE id = NEW.gig_id;
  v_context := jsonb_build_object('gig_id', NEW.gig_id, 'gig_title', v_gig_title,
    'song_titles', '''' || NEW.title || '''');
  FOR v_recipient IN
    SELECT DISTINCT p.user_id FROM public.performers p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.gig_id = NEW.gig_id AND p.user_id IS DISTINCT FROM v_actor
  LOOP
    PERFORM public.create_app_notification(v_recipient.user_id, 'nomination_added', 'nomination:' || NEW.id::text, v_context);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_nomination_added() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER nominations_notify_added
  AFTER INSERT ON public.nominations
  FOR EACH ROW EXECUTE FUNCTION public.notify_nomination_added();

-- Legacy queue handoff. UUID v5 must match the old Node namespace/name exactly:
-- an interrupted worker may already have written an outbox before updating its
-- queue row. Do not replace its content, read state, timestamps, or push state.
DO $$
DECLARE
  v_queue record;
  v_recipient record;
  v_id uuid;
  v_key text;
  v_gig_title text;
  v_song_titles text;
  v_context jsonb;
BEGIN
  FOR v_queue IN SELECT * FROM public.gig_notification_queue ORDER BY id LOOP
    v_key := 'legacy-queue:' || v_queue.id::text;
    SELECT title INTO v_gig_title FROM public.gigs WHERE id = v_queue.gig_id;
    SELECT CASE WHEN count(*) > 3 THEN
      string_agg('''' || t.title || '''', ', ' ORDER BY t.ordinality) FILTER (WHERE t.ordinality <= 2)
        || ' 외 ' || (count(*) - 2)::text || '곡'
      ELSE string_agg('''' || t.title || '''', ', ' ORDER BY t.ordinality) END
    INTO v_song_titles
    FROM (
      SELECT n.title, row_number() OVER (ORDER BY ids.ordinality) AS ordinality
      FROM unnest(v_queue.song_ids) WITH ORDINALITY ids(id, ordinality)
      JOIN public.nominations n ON n.id = ids.id
    ) t;
    v_context := jsonb_build_object('gig_id', v_queue.gig_id, 'gig_title', v_gig_title, 'song_titles', v_song_titles);

    -- Existing recipients can have left the gig; find their already-created
    -- outboxes independently of today's participant list before filling gaps.
    FOR v_recipient IN SELECT id AS user_id FROM public.users LOOP
      v_id := extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
        'nomination:' || v_queue.id::text || ':' || v_recipient.user_id::text);
      UPDATE public.notifications SET event_type = 'nomination_added', event_key = v_key
      WHERE id = v_id AND user_id = v_recipient.user_id;
    END LOOP;

    IF v_queue.status IN ('pending', 'processing') THEN
      FOR v_recipient IN
        SELECT DISTINCT p.user_id FROM public.performers p
        JOIN public.users u ON u.id = p.user_id
        WHERE p.gig_id = v_queue.gig_id AND p.user_id IS DISTINCT FROM v_queue.triggered_by
      LOOP
        v_id := extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
          'nomination:' || v_queue.id::text || ':' || v_recipient.user_id::text);
        IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_id) THEN
          PERFORM public.create_app_notification(v_recipient.user_id, 'nomination_added', v_key, v_context, v_id);
          -- The inbox timestamp describes this actual materialization. However,
          -- a long-abandoned event must not gain a fresh 24-hour push lifetime
          -- merely because this migration recovered its missing inbox row.
          IF v_queue.created_at <= now() - interval '24 hours' THEN
            UPDATE public.notifications
            SET push_status = 'failed', push_error = 'retry_window_expired'
            WHERE id = v_id AND push_status = 'pending';
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Completed queue entries are represented by their retained account inbox rows.
-- The old table has no independent audit purpose; do not expose an archive/RPC.
DROP TABLE public.gig_notification_queue;

COMMENT ON COLUMN public.notifications.event_type IS 'Stable event code; message text is rendered by create_app_notification.';
COMMENT ON COLUMN public.notifications.event_key IS 'Event identity within its type; one inbox row per recipient and event.';
COMMENT ON COLUMN public.notifications.push_status IS 'pending: due/leased/retry; accepted: FCM accepted; skipped: ineligible; failed: terminal failure. Not a display/read receipt.';
COMMENT ON COLUMN public.notifications.push_next_attempt_at IS 'Pending retry due time, or five-minute lease deadline while sending.';
COMMENT ON COLUMN public.notifications.push_progress IS 'Device IDs and bounded error codes only. No FCM tokens or provider messages.';

COMMIT;
