-- 1. session_part 컬럼 추가
ALTER TABLE public.nomination_responses 
ADD COLUMN IF NOT EXISTS session_part text NOT NULL DEFAULT '';

-- 2. 기존 데이터 마이그레이션 (기존 응답이 있는 경우 공연 참여자의 파트로 보정)
UPDATE public.nomination_responses nr
SET session_part = COALESCE(
  (
    SELECT split_part(p.part, ',', 1)
    FROM public.nominations n
    JOIN public.performers p ON p.gig_id = n.gig_id AND p.user_id = nr.user_id
    WHERE n.id = nr.nomination_id
    LIMIT 1
  ),
  '세션'
)
WHERE nr.session_part = '';

-- 3. 기존 단일 유저 유니크 제약조건 삭제
ALTER TABLE public.nomination_responses
DROP CONSTRAINT IF EXISTS nomination_responses_nomination_user_key;

-- 4. 복합 유니크 제약조건 생성 (후보곡 + 유저 + 세션파트)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nomination_responses_nomination_user_session_key'
  ) THEN
    ALTER TABLE public.nomination_responses
    ADD CONSTRAINT nomination_responses_nomination_user_session_key 
    UNIQUE (nomination_id, user_id, session_part);
  END IF;
END $$;

-- 5. 세션별 고속 조회를 위한 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_nomination_responses_session
ON public.nomination_responses (nomination_id, session_part);
