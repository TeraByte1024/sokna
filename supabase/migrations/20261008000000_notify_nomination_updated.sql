-- Notify only previous respondents whose saved session remains eligible after the edit.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_event_type_check,
  ADD CONSTRAINT notifications_event_type_check CHECK
    (event_type IN ('member_approval_requested', 'member_approved', 'gig_rsvp_requested',
      'nomination_added', 'nomination_updated', 'legacy'));

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

-- Keep matching semantics aligned with isPerformerMatchingSessionPart in lib/nomination.ts.
CREATE OR REPLACE FUNCTION public.nomination_session_matches(p_performer_part text, p_session_part text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  p text := lower(btrim(COALESCE(p_performer_part, '')));
  s text := lower(btrim(COALESCE(p_session_part, '')));
BEGIN
  IF p_performer_part IS NULL OR p_performer_part = '' THEN RETURN false; END IF;
  IF p = s THEN RETURN true; END IF;
  IF s ~ '(보컬\(남\)|남보컬)' THEN
    RETURN p ~ '(보컬\(남\)|남보컬)' OR p IN ('보컬', 'vocal');
  END IF;
  IF s ~ '(보컬\(여\)|여보컬)' THEN
    RETURN p ~ '(보컬\(여\)|여보컬)' OR p IN ('보컬', 'vocal');
  END IF;
  IF s ~ '(보컬|vocal)' THEN RETURN p ~ '(보컬|vocal)'; END IF;
  IF s ~ '(기타|guitar)' THEN RETURN p ~ '(기타|guitar|일렉|통기타)' OR p IN ('e.g', 'a.g'); END IF;
  IF s ~ '(베이스|bass)' THEN RETURN p ~ '(베이스|bass)' OR p = 'b'; END IF;
  IF s ~ '(드럼|drum)' THEN RETURN p ~ '(드럼|drum)' OR p = 'd'; END IF;
  IF s ~ '(건반|키보드|피아노|신디|keyboard|piano|synth)' THEN
    RETURN p ~ '(건반|키보드|피아노|신디|keyboard|piano|synth)';
  END IF;
  IF s ~ '(코러스|chorus)' THEN RETURN p ~ '(코러스|chorus)'; END IF;
  RETURN strpos(p, s) > 0 OR strpos(s, p) > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.nomination_session_matches(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_nomination_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(OLD.title, COALESCE(OLD.artist, ''), COALESCE(OLD.required_parts, '{}'::text[]),
    COALESCE(OLD.recommended_vocals, '[]'::jsonb), COALESCE(OLD.sheet_exists, false),
    COALESCE(OLD.sheet_note, ''), COALESCE(OLD.description, ''), COALESCE(OLD.links, '[]'::jsonb))
    IS DISTINCT FROM ROW(NEW.title, COALESCE(NEW.artist, ''), COALESCE(NEW.required_parts, '{}'::text[]),
    COALESCE(NEW.recommended_vocals, '[]'::jsonb), COALESCE(NEW.sheet_exists, false),
    COALESCE(NEW.sheet_note, ''), COALESCE(NEW.description, ''), COALESCE(NEW.links, '[]'::jsonb)) THEN
    -- Ensure every real edit has a distinct millisecond revision, including direct SQL writes.
    NEW.updated_at := GREATEST(date_trunc('milliseconds', clock_timestamp()), OLD.updated_at + interval '1 millisecond');
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_nomination_content_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER nominations_set_content_updated_at
  BEFORE UPDATE OF title, artist, required_parts, recommended_vocals, sheet_exists, sheet_note, description, links
  ON public.nominations FOR EACH ROW EXECUTE FUNCTION public.set_nomination_content_updated_at();

CREATE OR REPLACE FUNCTION public.notify_nomination_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_recipient record;
  v_context jsonb;
  v_event_key text;
BEGIN
  IF ROW(OLD.title, COALESCE(OLD.artist, ''), COALESCE(OLD.required_parts, '{}'::text[]),
    COALESCE(OLD.recommended_vocals, '[]'::jsonb), COALESCE(OLD.sheet_exists, false),
    COALESCE(OLD.sheet_note, ''), COALESCE(OLD.description, ''), COALESCE(OLD.links, '[]'::jsonb))
    IS NOT DISTINCT FROM ROW(NEW.title, COALESCE(NEW.artist, ''), COALESCE(NEW.required_parts, '{}'::text[]),
    COALESCE(NEW.recommended_vocals, '[]'::jsonb), COALESCE(NEW.sheet_exists, false),
    COALESCE(NEW.sheet_note, ''), COALESCE(NEW.description, ''), COALESCE(NEW.links, '[]'::jsonb)) THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    SELECT user_id INTO v_actor FROM public.performers
    WHERE id = NEW.created_by AND gig_id = NEW.gig_id;
  END IF;
  SELECT jsonb_build_object('gig_id', NEW.gig_id, 'gig_title', g.title,
    'nomination_id', NEW.id, 'song_titles', '''' || NEW.title || '''') INTO v_context
  FROM public.gigs g WHERE g.id = NEW.gig_id;
  v_event_key := 'nomination-updated:' || NEW.id::text || ':'
    || to_char(NEW.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  FOR v_recipient IN
    SELECT DISTINCT r.user_id FROM public.nomination_responses r
    JOIN public.users u ON u.id = r.user_id
    JOIN public.performers p ON p.user_id = r.user_id AND p.gig_id = NEW.gig_id
    WHERE r.nomination_id = NEW.id AND r.user_id IS DISTINCT FROM v_actor
      AND r.updated_at < NEW.updated_at
      -- A previous response must still belong to an eligible session in the edited song.
      AND r.session_part = ANY(COALESCE(NEW.required_parts, '{}'::text[]))
      AND (
        public.nomination_session_matches(p.part, r.session_part)
        OR (strpos(r.session_part, '보컬') > 0 AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.recommended_vocals) = 'array'
            THEN NEW.recommended_vocals ELSE '[]'::jsonb END) vocal(value)
          WHERE vocal.value->>'userId' = r.user_id::text OR vocal.value->>'id' = p.id::text
        ))
        OR (
          NOT EXISTS (
            SELECT 1 FROM unnest(ARRAY['보컬', '기타', '베이스', '드럼', '건반']) preset(part)
            WHERE public.nomination_session_matches(r.session_part, preset.part)
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.performers assigned
            CROSS JOIN LATERAL unnest(string_to_array(COALESCE(assigned.part, ''), ',')) assigned_part(part)
            WHERE assigned.gig_id = NEW.gig_id AND btrim(assigned_part.part) <> ''
              AND public.nomination_session_matches(btrim(assigned_part.part), r.session_part)
          )
        )
      )
  LOOP
    PERFORM public.create_app_notification(v_recipient.user_id, 'nomination_updated', v_event_key, v_context);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_nomination_updated() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER nominations_notify_updated
  AFTER UPDATE OF title, artist, required_parts, recommended_vocals, sheet_exists, sheet_note, description, links
  ON public.nominations FOR EACH ROW EXECUTE FUNCTION public.notify_nomination_updated();

COMMIT;
