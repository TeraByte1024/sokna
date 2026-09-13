-- gigs 테이블에 공연 부제목(subtitle) 컬럼 추가
ALTER TABLE public.gigs
ADD COLUMN IF NOT EXISTS subtitle text NULL;

COMMENT ON COLUMN public.gigs.subtitle IS '공연 부제목 (메인 제목 아래 표시되는 테마, 슬로건 등)';
