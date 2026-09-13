-- 1. gigs 테이블에 poster_url 컬럼 추가
ALTER TABLE public.gigs
ADD COLUMN IF NOT EXISTS poster_url text NULL;

COMMENT ON COLUMN public.gigs.poster_url IS '공연 포스터 이미지 URL';

-- 2. performers 테이블에 photo_url 컬럼 추가
ALTER TABLE public.performers
ADD COLUMN IF NOT EXISTS photo_url text NULL;

COMMENT ON COLUMN public.performers.photo_url IS '공연 세션 참여자 프로필 사진 URL';

-- 3. storage.buckets 에 gigs 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('gigs', 'gigs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- storage.objects RLS 정책
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access for gigs bucket'
  ) THEN
    CREATE POLICY "Public Access for gigs bucket"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'gigs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public/Auth upload for gigs bucket'
  ) THEN
    CREATE POLICY "Public/Auth upload for gigs bucket"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'gigs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public/Auth update for gigs bucket'
  ) THEN
    CREATE POLICY "Public/Auth update for gigs bucket"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'gigs');
  END IF;
END $$;
