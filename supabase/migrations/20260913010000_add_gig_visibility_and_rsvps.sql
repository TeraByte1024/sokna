-- 1. gigs 테이블에 공개 여부 컬럼 추가 (기본값 true)
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- 2. gig_rsvps (참가 신청/수요 조사) 테이블 생성
CREATE TABLE IF NOT EXISTS gig_rsvps (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  gig_id bigint NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going', 'not_going', 'undecided')),
  part text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gig_rsvps_gig_user_unique UNIQUE (gig_id, user_id)
);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_gig_rsvps_gig_id ON gig_rsvps(gig_id);
CREATE INDEX IF NOT EXISTS idx_gig_rsvps_user_id ON gig_rsvps(user_id);

-- RLS 활성화
ALTER TABLE gig_rsvps ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 후 재생성 (안전한 마이그레이션)
DROP POLICY IF EXISTS "Users can view their own rsvp or admins view all" ON gig_rsvps;
DROP POLICY IF EXISTS "Users can insert their own rsvp" ON gig_rsvps;
DROP POLICY IF EXISTS "Users can update their own rsvp" ON gig_rsvps;
DROP POLICY IF EXISTS "Users can delete their own rsvp" ON gig_rsvps;

-- 읽기: 본인 또는 관리자
CREATE POLICY "Users can view their own rsvp or admins view all"
  ON gig_rsvps FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

-- 등록: 본인 계정으로만 등록 가능
CREATE POLICY "Users can insert their own rsvp"
  ON gig_rsvps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 수정: 본인 계정으로만 수정 가능
CREATE POLICY "Users can update their own rsvp"
  ON gig_rsvps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 삭제: 본인 또는 관리자
CREATE POLICY "Users can delete their own rsvp"
  ON gig_rsvps FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );
