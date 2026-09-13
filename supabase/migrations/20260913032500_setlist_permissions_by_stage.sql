-- setlists 테이블의 공연 정보 vs 선곡회의 권한 분리 RLS 정책
-- 공연 정보(order_num > 0): 관리자만 수정/삭제 가능 (곡 등록자 권한 없음)
-- 선곡회의(order_num = 0): 관리자 또는 해당 곡 등록자가 수정/삭제 가능

ALTER TABLE public.setlists ENABLE ROW LEVEL SECURITY;

-- 1. SELECT 정책: 전체 공개
DROP POLICY IF EXISTS "Setlists select policy" ON public.setlists;
CREATE POLICY "Setlists select policy"
ON public.setlists FOR SELECT
USING (true);

-- 2. INSERT 정책: 관리자 또는 공연 참여자 (참여자는 선곡회의 곡 order_num = 0 만 등록 가능)
DROP POLICY IF EXISTS "Setlists insert policy" ON public.setlists;
CREATE POLICY "Setlists insert policy"
ON public.setlists FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.is_admin()
    OR (
      (order_num IS NULL OR order_num = 0)
      AND EXISTS (
        SELECT 1 FROM public.performers
        WHERE performers.gig_id = setlists.gig_id
          AND performers.user_id = auth.uid()
      )
    )
  )
);

-- 3. UPDATE 정책:
-- - 관리자: 모든 셋리스트(공연 정보 셋리스트 포함) 수정 가능
-- - 곡 등록자: 오직 선곡회의 곡(order_num = 0 또는 NULL)만 수정 가능 (공연 정보 셋리스트는 수정 불가)
DROP POLICY IF EXISTS "Setlists update policy" ON public.setlists;
CREATE POLICY "Setlists update policy"
ON public.setlists FOR UPDATE
USING (
  public.is_admin()
  OR (
    (order_num IS NULL OR order_num = 0)
    AND EXISTS (
      SELECT 1 FROM public.performers
      WHERE performers.id = setlists.created_by
        AND performers.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    (order_num IS NULL OR order_num = 0)
    AND EXISTS (
      SELECT 1 FROM public.performers
      WHERE performers.id = setlists.created_by
        AND performers.user_id = auth.uid()
    )
  )
);

-- 4. DELETE 정책:
-- - 관리자: 모든 셋리스트(공연 정보 셋리스트 포함) 삭제 가능
-- - 곡 등록자: 오직 선곡회의 곡(order_num = 0 또는 NULL)만 삭제 가능 (공연 정보 셋리스트는 삭제 불가)
DROP POLICY IF EXISTS "Setlists delete policy" ON public.setlists;
CREATE POLICY "Setlists delete policy"
ON public.setlists FOR DELETE
USING (
  public.is_admin()
  OR (
    (order_num IS NULL OR order_num = 0)
    AND EXISTS (
      SELECT 1 FROM public.performers
      WHERE performers.id = setlists.created_by
        AND performers.user_id = auth.uid()
    )
  )
);
