-- Open the newly nominated song from both inbox and push notifications.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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
      v_link := '/gigs/' || (p_context->>'gig_id') || '/nominations?song=' || (p_context->>'nomination_id');
    WHEN 'nomination_updated' THEN
      v_title := format('[%s] 선곡회의 후보곡 수정',
        COALESCE(NULLIF(p_context->>'gig_title', ''), '공연'));
      v_body := COALESCE(NULLIF(p_context->>'song_titles', ''), '후보곡')
        || '의 내용이 수정되었습니다. 변경된 내용을 확인해주세요.';
      v_link := '/gigs/' || (p_context->>'gig_id') || '/nominations?song=' || (p_context->>'nomination_id');
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
    'nomination_id', NEW.id, 'song_titles', '''' || NEW.title || '''');
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

COMMIT;
