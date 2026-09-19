-- 1. 후보곡 세션 참여 가능 여부 및 코멘트 테이블 생성
CREATE TABLE IF NOT EXISTS public.nomination_responses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nomination_id bigint NOT NULL REFERENCES public.nominations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'undecided' CHECK (status IN ('available', 'undecided', 'unavailable')),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nomination_responses_nomination_user_key UNIQUE (nomination_id, user_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_nomination_responses_nomination
  ON public.nomination_responses (nomination_id);

CREATE INDEX IF NOT EXISTS idx_nomination_responses_user
  ON public.nomination_responses (user_id);

-- RLS 활성화
ALTER TABLE public.nomination_responses ENABLE ROW LEVEL SECURITY;

-- 1. 조회: 인증된 사용자는 모든 응답 조회 가능 (공연 세션원 간 조율을 위해 투명하게 공유)
CREATE POLICY "Authenticated users can select nomination responses"
  ON public.nomination_responses
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. 등록: 본인의 응답만 등록 가능
CREATE POLICY "Users can insert own nomination responses"
  ON public.nomination_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. 수정: 본인의 응답 또는 관리자만 수정 가능
CREATE POLICY "Users can update own nomination responses"
  ON public.nomination_responses
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 4. 삭제: 본인의 응답 또는 관리자만 삭제 가능
CREATE POLICY "Users can delete own nomination responses"
  ON public.nomination_responses
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
