-- admins 테이블 RLS 정책: 관리자의 조회, 등록, 삭제 권한 허용
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- 1. 조회(SELECT) 정책: 관리자이거나 본인 레코드인 경우 조회 허용
DROP POLICY IF EXISTS "Enable read self-access for all users" ON public.admins;
DROP POLICY IF EXISTS "admins_select_policy" ON public.admins;
CREATE POLICY admins_select_policy ON public.admins
  FOR SELECT
  USING (
    public.is_admin() OR auth.uid() = id
  );

-- 2. 등록(INSERT) 정책: 관리자는 다른 회원을 관리자로 등록 가능
DROP POLICY IF EXISTS "admins_insert_policy" ON public.admins;
CREATE POLICY admins_insert_policy ON public.admins
  FOR INSERT
  WITH CHECK (
    public.is_admin()
  );

-- 3. 삭제(DELETE) 정책: 관리자는 관리자 권한 해제 가능
DROP POLICY IF EXISTS "admins_delete_policy" ON public.admins;
CREATE POLICY admins_delete_policy ON public.admins
  FOR DELETE
  USING (
    public.is_admin()
  );
