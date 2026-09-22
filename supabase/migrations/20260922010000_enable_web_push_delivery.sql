-- 웹 푸시 구독 및 알림 outbox 전달 상태
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS push_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_push_status_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_push_status_check
      CHECK (push_status IN ('pending', 'processing', 'sent', 'skipped', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_push_pending
  ON public.notifications (created_at)
  WHERE push_eligible = true AND push_status = 'pending';

-- 한 FCM 토큰은 한 계정에만 연결합니다. 같은 계정은 여러 기기를 등록할 수 있습니다.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_fcm_token_key
  ON public.profiles (fcm_token);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push profiles" ON public.profiles;
CREATE POLICY "Users can view own push profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push profiles" ON public.profiles;
CREATE POLICY "Users can insert own push profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.marketing_opt_in = true
    )
  );

DROP POLICY IF EXISTS "Users can update own push profiles" ON public.profiles;
CREATE POLICY "Users can update own push profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.marketing_opt_in = true
    )
  );

DROP POLICY IF EXISTS "Users can delete own push profiles" ON public.profiles;
CREATE POLICY "Users can delete own push profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 이메일 가입은 auth 생성 시, Google 가입은 필수 프로필 완성 시 승인 요청 알림을 생성합니다.
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
  v_name := COALESCE(NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1));

  BEGIN
    v_gen := NULLIF(TRIM(new.raw_user_meta_data->>'generation'), '')::integer;
  EXCEPTION WHEN OTHERS THEN
    v_gen := NULL;
  END;

  v_part := NULLIF(TRIM(new.raw_user_meta_data->>'part'), '');
  v_marketing := COALESCE((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false);

  INSERT INTO public.users (
    id, name, generation, part, email, status, applied_at, marketing_opt_in
  )
  VALUES (
    new.id, v_name, v_gen, v_part, new.email, 'pending', now(), v_marketing
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = CASE WHEN public.users.name = '' OR public.users.name IS NULL THEN EXCLUDED.name ELSE public.users.name END,
    generation = COALESCE(public.users.generation, EXCLUDED.generation),
    part = COALESCE(public.users.part, EXCLUDED.part),
    marketing_opt_in = EXCLUDED.marketing_opt_in;

  -- OAuth 최초 로그인처럼 필수 가입 정보가 아직 없으면 completeProfileAction이 알림을 생성합니다.
  IF v_gen IS NOT NULL AND v_part IS NOT NULL THEN
    FOR v_admin IN
      SELECT a.id FROM public.admins a JOIN public.users u ON u.id = a.id
    LOOP
      INSERT INTO public.notifications (
        user_id, title, body, link, created_at, push_eligible
      ) VALUES (
        v_admin.id,
        '신규 회원가입 승인 요청',
        format('%s (%s기, %s)님이 가입 승인을 요청했습니다.', v_name, v_gen::text, v_part),
        '/admin/members',
        now(),
        true
      );
    END LOOP;
  END IF;

  RETURN new;
END;
$$;
