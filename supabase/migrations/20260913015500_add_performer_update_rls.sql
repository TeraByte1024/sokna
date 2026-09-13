-- performers 테이블 RLS 활성화 및 본인/관리자 수정 정책 추가
ALTER TABLE public.performers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Performers select policy" ON public.performers;
CREATE POLICY "Performers select policy"
ON public.performers FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Performers update policy for admin or self" ON public.performers;
CREATE POLICY "Performers update policy for admin or self"
ON public.performers FOR UPDATE
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid())
);
