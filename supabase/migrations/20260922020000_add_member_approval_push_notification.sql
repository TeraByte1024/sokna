-- 회원 승인과 승인 완료 푸시 outbox 생성을 하나의 트랜잭션으로 처리합니다.
CREATE OR REPLACE FUNCTION public.approve_member_with_notification(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer;
  v_now timestamptz := now();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 회원을 승인할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
  SET
    status = 'approved',
    approved_at = v_now
  WHERE id = p_user_id
    AND status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count = 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    link,
    created_at,
    push_eligible,
    push_status
  ) VALUES (
    p_user_id,
    '회원가입 승인 완료',
    '소리로 크는 나무(소크나)의 정식 회원으로 승인되었습니다. 환영합니다!',
    '/members',
    v_now,
    true,
    'pending'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_member_with_notification(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_member_with_notification(uuid) TO authenticated;
