-- setlists 테이블의 RLS 정책 수정 및 DELETE 정책 추가
ALTER TABLE public.setlists ENABLE ROW LEVEL SECURITY;

-- 1. SELECT 정책: 모든 사용자(비로그인 포함) 조회 가능
DROP POLICY IF EXISTS "Enable read access for users" ON public.setlists;
DROP POLICY IF EXISTS "Setlists select policy" ON public.setlists;
CREATE POLICY "Setlists select policy"
ON public.setlists FOR SELECT
USING (true);

-- 2. INSERT 정책: 관리자 또는 해당 공연 참여자
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.setlists;
DROP POLICY IF EXISTS "Setlists insert policy" ON public.setlists;
CREATE POLICY "Setlists insert policy"
ON public.setlists FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.performers
      WHERE performers.gig_id = setlists.gig_id
        AND performers.user_id = auth.uid()
    )
  )
);

-- 3. UPDATE 정책: 관리자 또는 해당 곡 등록자
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.setlists;
DROP POLICY IF EXISTS "Setlists update policy" ON public.setlists;
CREATE POLICY "Setlists update policy"
ON public.setlists FOR UPDATE
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.performers
    WHERE performers.id = setlists.created_by
      AND performers.user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.performers
    WHERE performers.id = setlists.created_by
      AND performers.user_id = auth.uid()
  )
);

-- 4. DELETE 정책: 관리자 또는 해당 곡 등록자
DROP POLICY IF EXISTS "Setlists delete policy" ON public.setlists;
CREATE POLICY "Setlists delete policy"
ON public.setlists FOR DELETE
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.performers
    WHERE performers.id = setlists.created_by
      AND performers.user_id = auth.uid()
  )
);
