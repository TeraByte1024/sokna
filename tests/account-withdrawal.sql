-- 관리자 SQL 연결에서 실행. 모든 가상 데이터는 마지막 ROLLBACK으로 제거합니다.
-- 가입 메타데이터를 비워 관리자 알림이 생성되지 않도록 합니다.
-- 웹훅이 연결된 notifications/setlists에는 테스트 데이터를 쓰지 않습니다.
BEGIN;
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_gig bigint := -92602001;
  v_performer bigint := -92602001;
  v_song bigint := -92602001;
  v_result boolean;
BEGIN
  IF has_function_privilege('anon', 'public.delete_my_account(text)', 'execute') THEN
    RAISE EXCEPTION 'anon must not execute withdrawal';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.delete_my_account(text)', 'execute') THEN
    RAISE EXCEPTION 'authenticated must execute withdrawal';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.delete_my_account('탈퇴');
    RAISE EXCEPTION 'anonymous withdrawal unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO auth.users (id, email) VALUES
    (v_user, v_user::text || '@withdrawal-test.invalid'),
    (v_other, v_other::text || '@withdrawal-test.invalid');
  INSERT INTO public.gigs (id, title, perform_date) OVERRIDING SYSTEM VALUE
    VALUES (v_gig, '탈퇴 트랜잭션 테스트', current_date);
  INSERT INTO public.performers (id, gig_id, user_id, part, name, photo_url) OVERRIDING SYSTEM VALUE
    VALUES (v_performer, v_gig, v_user, '기타', '탈퇴 테스트', 'https://example.invalid/test.jpg');
  INSERT INTO public.nominations (id, gig_id, title, created_by) OVERRIDING SYSTEM VALUE
    VALUES (v_song, v_gig, '보존할 후보곡', v_performer);
  INSERT INTO public.profiles (user_id, fcm_token) VALUES (v_user, v_user::text), (v_other, v_other::text);
  INSERT INTO public.gig_rsvps (id, gig_id, user_id, status) OVERRIDING SYSTEM VALUE
    VALUES (v_song, v_gig, v_user, 'going');
  INSERT INTO public.setlist_views (user_id, gig_id) VALUES (v_user, v_gig);
  INSERT INTO public.nomination_responses (id, nomination_id, user_id) OVERRIDING SYSTEM VALUE
    VALUES (v_song, v_song, v_user);
  INSERT INTO public.gig_notification_queue (id, gig_id, triggered_by, scheduled_at) OVERRIDING SYSTEM VALUE
    VALUES (v_song, v_gig, v_user, now());
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  BEGIN
    PERFORM public.delete_my_account('잘못된 확인');
    RAISE EXCEPTION 'invalid confirmation unexpectedly succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    RAISE EXCEPTION 'invalid confirmation changed account';
  END IF;

  -- 성공 후 상위 트랜잭션 오류도 전체 삭제를 되돌리는지 확인합니다.
  BEGIN
    PERFORM public.delete_my_account('탈퇴');
    RAISE EXCEPTION 'rollback probe' USING ERRCODE = 'ZX001';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user)
    OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user)
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user)
    OR NOT EXISTS (SELECT 1 FROM public.performers WHERE id = v_performer AND user_id = v_user) THEN
    RAISE EXCEPTION 'withdrawal rollback did not restore account data';
  END IF;

  SELECT public.delete_my_account('탈퇴') INTO v_result;
  IF v_result IS DISTINCT FROM true
    OR EXISTS (SELECT 1 FROM auth.users WHERE id = v_user)
    OR EXISTS (SELECT 1 FROM public.users WHERE id = v_user)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.gig_rsvps WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.setlist_views WHERE user_id = v_user)
    OR EXISTS (SELECT 1 FROM public.nomination_responses WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'withdrawal left personal data';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.performers WHERE id = v_performer AND user_id IS NULL AND name = '탈퇴 회원' AND photo_url IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.nominations WHERE id = v_song AND created_by = v_performer)
    OR NOT EXISTS (SELECT 1 FROM public.gig_notification_queue WHERE id = v_song AND triggered_by IS NULL)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_other)
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_other) THEN
    RAISE EXCEPTION 'withdrawal damaged shared records or another account';
  END IF;
  -- 삭제된 계정의 잔여 JWT도 다시 실행할 수 없습니다.
  BEGIN
    PERFORM public.delete_my_account('탈퇴');
    RAISE EXCEPTION 'deleted account unexpectedly executed withdrawal';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
ROLLBACK;
