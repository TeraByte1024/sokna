-- Keep participation requests in the same account notification outbox as other events.
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_event_type_check,
  ADD CONSTRAINT notifications_event_type_check CHECK
    (event_type IN ('member_approval_requested', 'member_approved',
      'gig_rsvp_requested', 'nomination_added', 'legacy'));

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
    WHEN 'gig_rsvp_requested' THEN
      v_title := format('[%s] 공연 참여 신청',
        COALESCE(NULLIF(p_context->>'gig_title', ''), '공연'));
      v_body := format('%s (%s기)님이 %s 세션으로 참여를 신청했습니다.',
        COALESCE(NULLIF(p_context->>'name', ''), '회원'),
        COALESCE(NULLIF(p_context->>'generation', ''), '?'),
        COALESCE(NULLIF(p_context->>'part', ''), '미지정'));
      v_link := '/admin/members';
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
  IF NEW.status <> 'going' THEN
    RETURN NEW;
  END IF;
  -- Saving the sessions or note of an existing pending request is not a new application.
  IF TG_OP = 'UPDATE' AND OLD.status = 'going' THEN
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

CREATE TRIGGER gig_rsvps_notify_requested
  AFTER INSERT OR UPDATE OF status ON public.gig_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.notify_gig_rsvp_requested();
