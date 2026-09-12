-- is_admin() 함수가 존재하지 않는 user_id 컬럼을 참조하던 버그 수정
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid()
       OR email = (auth.jwt() ->> 'email')
  );
END;
$$;
