-- 1. 사용자별 공연 선곡회의 마지막 조회 시점 테이블
CREATE TABLE IF NOT EXISTS public.setlist_views (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gig_id bigint NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gig_id)
);

-- RLS 활성화
ALTER TABLE public.setlist_views ENABLE ROW LEVEL SECURITY;

-- 본인 조회 권한
CREATE POLICY "Users can view own setlist views"
  ON public.setlist_views
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 본인 등록 및 갱신 권한
CREATE POLICY "Users can insert own setlist views"
  ON public.setlist_views
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own setlist views"
  ON public.setlist_views
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 2. 새 곡 등록 시 일정 시간 후 참여자 알림을 위한 대기열(Queue) 테이블
CREATE TABLE IF NOT EXISTS public.gig_notification_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gig_id bigint NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  triggered_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  song_ids bigint[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'cancelled'
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- 인덱스 생성 (스케줄링 주기적 검색 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_gig_notification_queue_pending
  ON public.gig_notification_queue (scheduled_at, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_gig_notification_queue_gig_pending
  ON public.gig_notification_queue (gig_id, status)
  WHERE status = 'pending';

-- RLS 활성화
ALTER TABLE public.gig_notification_queue ENABLE ROW LEVEL SECURITY;

-- 관리자 및 공연 참여자 권한 정책
-- 서비스 롤/서버 액션에서 주로 처리하지만, 인증된 유저의 큐 생성/조회 지원
CREATE POLICY "Authenticated users can insert notification queue"
  ON public.gig_notification_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can select notification queue"
  ON public.gig_notification_queue
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update notification queue"
  ON public.gig_notification_queue
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
