BEGIN;

-- Participation intent and an administrator's decision are separate states.
ALTER TABLE public.gig_rsvps
  ADD COLUMN review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by uuid,
  ADD CONSTRAINT gig_rsvps_review_status_check
    CHECK (review_status IN ('pending', 'approved', 'rejected'));

UPDATE public.gig_rsvps r
SET review_status = 'approved'
WHERE r.status = 'going'
  AND EXISTS (
    SELECT 1 FROM public.performers p
    WHERE p.gig_id = r.gig_id AND p.user_id = r.user_id
  );

CREATE INDEX gig_rsvps_pending_review_idx
  ON public.gig_rsvps (gig_id, created_at)
  WHERE status = 'going' AND review_status = 'pending';

-- Direct member writes must not be able to approve themselves or erase a
-- review. Saving a rejected going request is an explicit new application.
CREATE FUNCTION public.protect_gig_rsvp_review()
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
    IF NEW.review_status <> 'pending'
      OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL THEN
      RAISE EXCEPTION 'Only administrators can review participation requests.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.gig_id IS DISTINCT FROM OLD.gig_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'The request owner and gig cannot change.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.review_status IN ('rejected', 'approved') AND NEW.status = 'going'
      AND NOT EXISTS (SELECT 1 FROM public.performers p
        WHERE p.gig_id = OLD.gig_id AND p.user_id = OLD.user_id) THEN
      NEW.review_status := 'pending';
      NEW.reviewed_at := NULL;
      NEW.reviewed_by := NULL;
      NEW.updated_at := clock_timestamp();
    ELSIF OLD.review_status = 'approved' AND EXISTS (
      SELECT 1 FROM public.performers p
      WHERE p.gig_id = OLD.gig_id AND p.user_id = OLD.user_id
    ) THEN
      RAISE EXCEPTION 'A registered performer cannot change the application.'
        USING ERRCODE = '42501';
    ELSIF NEW.review_status IS DISTINCT FROM OLD.review_status
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
      RAISE EXCEPTION 'Only administrators can review participation requests.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_gig_rsvp_review() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER gig_rsvps_protect_review
  BEFORE INSERT OR UPDATE ON public.gig_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.protect_gig_rsvp_review();

DROP POLICY IF EXISTS "Users can delete their own rsvp" ON public.gig_rsvps;
CREATE POLICY "Users can delete their own rsvp"
  ON public.gig_rsvps FOR DELETE
  USING (
    public.is_admin()
    OR (auth.uid() = user_id AND review_status = 'pending')
  );

CREATE OR REPLACE FUNCTION public.review_gig_rsvp(
  p_gig_id bigint,
  p_rsvp_id bigint,
  p_updated_at timestamptz,
  p_decision text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rsvp public.gig_rsvps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 참가 신청을 처리할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION '올바른 처리 방법을 선택해 주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rsvp FROM public.gig_rsvps
  WHERE id = p_rsvp_id AND gig_id = p_gig_id FOR UPDATE;

  IF NOT FOUND OR v_rsvp.status <> 'going'
    OR v_rsvp.review_status <> 'pending'
    OR v_rsvp.updated_at IS DISTINCT FROM p_updated_at THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.performers
    WHERE gig_id = v_rsvp.gig_id AND user_id = v_rsvp.user_id
  ) THEN
    RETURN false;
  END IF;

  IF p_decision = 'approve' THEN
    IF nullif(btrim(v_rsvp.part), '') IS NULL THEN
      RAISE EXCEPTION '희망 세션이 없는 신청은 승인할 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.performers (gig_id, user_id, part)
    VALUES (v_rsvp.gig_id, v_rsvp.user_id, btrim(v_rsvp.part));
  END IF;

  UPDATE public.gig_rsvps
  SET review_status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
      reviewed_at = clock_timestamp(),
      reviewed_by = auth.uid(),
      updated_at = clock_timestamp()
  WHERE id = v_rsvp.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.review_gig_rsvp(bigint, bigint, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_gig_rsvp(bigint, bigint, timestamptz, text)
  TO authenticated;

-- A manual assignment also resolves a pending request. Removing a performer
-- keeps the prior review as history; a later member save can reapply.
CREATE FUNCTION public.mark_gig_rsvp_approved_on_performer_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.gig_rsvps
    SET review_status = 'approved',
        reviewed_at = clock_timestamp(),
        reviewed_by = auth.uid(),
        updated_at = clock_timestamp()
    WHERE gig_id = NEW.gig_id AND user_id = NEW.user_id
      AND status = 'going' AND review_status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_gig_rsvp_approved_on_performer_insert()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER performers_mark_rsvp_approved
  AFTER INSERT ON public.performers
  FOR EACH ROW EXECUTE FUNCTION public.mark_gig_rsvp_approved_on_performer_insert();
-- Keep the existing notification text and event keys; only the admin
-- destination changes. Older inbox items are updated below.
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
      v_link := '/admin/approvals';
    WHEN 'member_approved' THEN
      v_title := '회원가입 승인 완료';
      v_body := '소리로 크는 나무(소크나)의 정식 회원으로 승인되었습니다. 환영합니다!';
      v_link := '/members';
    WHEN 'gig_rsvp_requested' THEN
      v_title := format('[%s] 공연 참여 신청',
        COALESCE(NULLIF(p_context->>'gig_title', ''), '공연'));
      v_body := format('%s (%s기)님이 %s 세션으로 참여를 신청했습니다.',
        COALESCE(NULLIF(p_context->>'name', ''), '회원'),
        COALESCE(NULLIF(p_context->>'generation', ''), '?'),
        COALESCE(NULLIF(p_context->>'part', ''), '미지정'));
      v_link := '/admin/approvals';
    WHEN 'nomination_added' THEN
      v_title := format('[%s] 선곡회의 새 후보곡 등록',
        COALESCE(NULLIF(p_context->>'gig_title', ''), '공연'));
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

UPDATE public.notifications
SET link = '/admin/approvals'
WHERE event_type IN ('member_approval_requested', 'gig_rsvp_requested')
  AND link = '/admin/members';

CREATE OR REPLACE FUNCTION public.notify_gig_rsvp_requested()
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
  IF NEW.status <> 'going' OR NEW.review_status <> 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.status = 'going' AND OLD.review_status = 'pending' THEN
    RETURN NEW;
  END IF;

  v_event_key := 'gig-rsvp:' || NEW.id::text || ':'
    || to_char(NEW.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  SELECT jsonb_build_object(
    'gig_title', g.title, 'name', u.name, 'generation', u.generation, 'part', NEW.part
  ) INTO v_context
  FROM public.gigs g CROSS JOIN public.users u
  WHERE g.id = NEW.gig_id AND u.id = NEW.user_id;

  FOR v_admin IN SELECT a.id FROM public.admins a JOIN public.users u ON u.id = a.id LOOP
    PERFORM public.create_app_notification(
      v_admin.id, 'gig_rsvp_requested', v_event_key, v_context
    );
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_gig_rsvp_requested() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS gig_rsvps_notify_requested ON public.gig_rsvps;
CREATE TRIGGER gig_rsvps_notify_requested
  AFTER INSERT OR UPDATE ON public.gig_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.notify_gig_rsvp_requested();

COMMIT;
