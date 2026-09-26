-- 본인 계정과 개인 데이터를 원자적으로 삭제하고 공유 공연 기록은 유지합니다.
CREATE OR REPLACE FUNCTION public.delete_my_account(p_confirmation text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  IF p_confirmation IS DISTINCT FROM '탈퇴' THEN
    RAISE EXCEPTION '확인 문구를 정확히 입력해 주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '로그인 계정을 찾을 수 없습니다.' USING ERRCODE = '42501';
  END IF;

  -- 관리자 동시 탈퇴와 관리자 목록 변경을 직렬화합니다.
  LOCK TABLE public.admins IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = v_user_id OR a.email = v_email
  ) AND NOT EXISTS (
    SELECT 1 FROM public.admins a
    JOIN auth.users u ON u.id = a.id OR u.email = a.email
    WHERE u.id <> v_user_id
      AND a.id <> v_user_id
      AND a.email IS DISTINCT FROM v_email
  ) THEN
    RAISE EXCEPTION '다른 관리자를 지정한 뒤 탈퇴해 주세요.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.admins WHERE id = v_user_id OR email = v_email;

  UPDATE public.performers
  SET user_id = NULL, name = '탈퇴 회원', photo_url = NULL
  WHERE user_id = v_user_id;

  DELETE FROM public.profiles WHERE user_id = v_user_id;
  DELETE FROM public.notifications WHERE user_id = v_user_id;
  DELETE FROM public.users WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(text) TO authenticated;
