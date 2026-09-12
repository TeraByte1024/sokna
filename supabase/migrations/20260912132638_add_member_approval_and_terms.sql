-- users 테이블에 회원 가입 승인 및 약관 관련 컬럼 추가
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false;

-- 기존 등록되어 있던 부원들은 이미 활동 중이므로 'approved'로 일괄 전환
UPDATE public.users
SET status = 'approved'
WHERE status = 'pending';

-- status 허용 값 제약 조건 설정
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- RLS 정책 보강: 관리자는 모든 유저 수정 가능, 본인은 본인 유저 정보 조회 및 등록 가능
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- 1. 본인 또는 관리자의 users 읽기 허용 정책
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_select_policy'
  ) THEN
    CREATE POLICY users_select_policy ON public.users
      FOR SELECT
      USING (
        status = 'approved' 
        OR auth.uid() = id 
        OR public.is_admin()
      );
  END IF;

  -- 2. 신규 가입자 본인의 users 등록 허용 정책
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_insert_policy'
  ) THEN
    CREATE POLICY users_insert_policy ON public.users
      FOR INSERT
      WITH CHECK (
        auth.uid() = id OR public.is_admin()
      );
  END IF;

  -- 3. 관리자의 users 수정(승인/반려) 허용 정책
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_update_policy'
  ) THEN
    CREATE POLICY users_update_policy ON public.users
      FOR UPDATE
      USING (
        auth.uid() = id OR public.is_admin()
      )
      WITH CHECK (
        auth.uid() = id OR public.is_admin()
      );
  END IF;
END $$;
