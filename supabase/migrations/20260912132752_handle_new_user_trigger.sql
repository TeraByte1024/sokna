-- 신규 회원가입 시 public.users 레코드 자동 생성 및 관리자 알림 발송 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_gen integer;
  v_part text;
  v_marketing boolean;
  v_admin record;
BEGIN
  -- 사용자 메타데이터 파싱
  v_name := COALESCE(NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1));
  
  BEGIN
    v_gen := NULLIF(TRIM(new.raw_user_meta_data->>'generation'), '')::integer;
  EXCEPTION WHEN OTHERS THEN
    v_gen := NULL;
  END;

  v_part := NULLIF(TRIM(new.raw_user_meta_data->>'part'), '');
  v_marketing := COALESCE((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false);

  -- public.users 테이블에 pending 상태로 등록 (또는 업데이트)
  INSERT INTO public.users (
    id,
    name,
    generation,
    part,
    email,
    status,
    applied_at,
    marketing_opt_in
  )
  VALUES (
    new.id,
    v_name,
    v_gen,
    v_part,
    new.email,
    'pending',
    now(),
    v_marketing
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = CASE WHEN public.users.name = '' OR public.users.name IS NULL THEN EXCLUDED.name ELSE public.users.name END,
    generation = COALESCE(public.users.generation, EXCLUDED.generation),
    part = COALESCE(public.users.part, EXCLUDED.part),
    marketing_opt_in = EXCLUDED.marketing_opt_in;

  -- 관리자(admins)들에게 notifications 레코드 생성
  FOR v_admin IN 
    SELECT a.id 
    FROM public.admins a
    JOIN public.users u ON u.id = a.id
  LOOP
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      link,
      created_at
    )
    VALUES (
      v_admin.id,
      '신규 회원가입 승인 요청',
      format('%s (%s기, %s)님이 가입 승인을 요청했습니다.', v_name, COALESCE(v_gen::text, '미지정'), COALESCE(v_part, '미지정')),
      '/admin/members',
      now()
    );
  END LOOP;

  RETURN new;
END;
$$;

-- 트리거 생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
