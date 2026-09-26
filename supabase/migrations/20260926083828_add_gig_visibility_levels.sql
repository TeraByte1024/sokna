BEGIN;

ALTER TABLE public.gigs ADD COLUMN visibility text;

-- 기존 비공개 공연의 회원 열람 범위를 그대로 보존합니다.
UPDATE public.gigs
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'members' END;

ALTER TABLE public.gigs
  ALTER COLUMN visibility SET DEFAULT 'members',
  ALTER COLUMN visibility SET NOT NULL,
  ADD CONSTRAINT gigs_visibility_check CHECK (visibility IN ('private', 'members', 'public')),
  ALTER COLUMN is_public SET DEFAULT false;

COMMENT ON COLUMN public.gigs.visibility IS
  '공연 공개 범위: private=관리자 전용, members=로그인 회원, public=전체 공개';
COMMENT ON COLUMN public.gigs.is_public IS
  '이전 클라이언트 호환용. visibility=public 여부를 저장하며 공개 범위 판단에는 visibility를 사용';

-- 공개 범위의 기준은 visibility이며 호환용 boolean은 항상 이에 맞춥니다.
CREATE FUNCTION public.sync_gig_public_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.is_public := NEW.visibility = 'public';
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_gig_public_flag
BEFORE INSERT OR UPDATE OF visibility, is_public ON public.gigs
FOR EACH ROW EXECUTE FUNCTION public.sync_gig_public_flag();

ALTER TABLE public.gigs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gigs visibility read access"
ON public.gigs FOR SELECT TO anon, authenticated
USING (
  visibility = 'public'
  OR (auth.uid() IS NOT NULL AND (visibility = 'members' OR public.is_admin()))
);

-- 기존 허용형 SELECT 정책이 남아 있어도 새 공개 범위를 우회할 수 없습니다.
CREATE POLICY "Gigs visibility read boundary"
ON public.gigs AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  visibility = 'public'
  OR (auth.uid() IS NOT NULL AND (visibility = 'members' OR public.is_admin()))
);

CREATE POLICY "Admins manage gigs"
ON public.gigs FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 상세의 하위 테이블을 직접 조회해 비공개 공연 정보를 읽는 것도 차단합니다.
CREATE POLICY "Performers gig visibility boundary"
ON public.performers AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = performers.gig_id));

CREATE POLICY "Setlists gig visibility boundary"
ON public.setlists AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = setlists.gig_id));

CREATE POLICY "Nominations gig visibility boundary"
ON public.nominations AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.gigs WHERE gigs.id = nominations.gig_id));

CREATE POLICY "Nomination responses gig visibility boundary"
ON public.nomination_responses AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.nominations WHERE nominations.id = nomination_responses.nomination_id));

COMMIT;
