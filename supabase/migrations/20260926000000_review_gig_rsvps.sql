-- 신청 내용이 바뀌거나 두 관리자가 동시에 처리해도 한 번만 승인/무시합니다.
CREATE OR REPLACE FUNCTION public.review_gig_rsvp(
  p_gig_id bigint,
  p_rsvp_id bigint,
  p_updated_at timestamptz,
  p_decision text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rsvp public.gig_rsvps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 참가 신청을 처리할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'ignore') THEN
    RAISE EXCEPTION '올바른 처리 방법을 선택해 주세요.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_rsvp
  FROM public.gig_rsvps
  WHERE id = p_rsvp_id AND gig_id = p_gig_id
  FOR UPDATE;

  IF NOT FOUND OR v_rsvp.status <> 'going'
    OR v_rsvp.updated_at IS DISTINCT FROM p_updated_at THEN
    RETURN false;
  END IF;

  -- 실제 공연자 등록 여부를 승인 상태의 기준으로 삼습니다.
  IF EXISTS (
    SELECT 1 FROM public.performers
    WHERE gig_id = v_rsvp.gig_id AND user_id = v_rsvp.user_id
  ) THEN
    RETURN false;
  END IF;

  IF p_decision = 'approve' THEN
    IF nullif(btrim(v_rsvp.part), '') IS NULL THEN
      RAISE EXCEPTION '희망 세션이 없는 신청은 승인할 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.performers (gig_id, user_id, part)
    VALUES (v_rsvp.gig_id, v_rsvp.user_id, btrim(v_rsvp.part));
  ELSE
    -- 무시는 미신청 상태로 복원하며 다시 신청할 수 있습니다.
    DELETE FROM public.gig_rsvps WHERE id = v_rsvp.id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.review_gig_rsvp(bigint, bigint, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_gig_rsvp(bigint, bigint, timestamptz, text) TO authenticated;

-- 앱과 동일하게 id 또는 이메일로 관리자 권한을 확인합니다.
DROP POLICY IF EXISTS "Users can view their own rsvp or admins view all" ON public.gig_rsvps;
CREATE POLICY "Users can view their own rsvp or admins view all"
  ON public.gig_rsvps FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
