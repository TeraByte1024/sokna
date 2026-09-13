-- gigs 테이블에 공연 장소(location) 컬럼 추가
ALTER TABLE public.gigs
ADD COLUMN IF NOT EXISTS location text NULL;

COMMENT ON COLUMN public.gigs.location IS '공연 장소 (예: 한양대학교 학생회관 콘서트홀, 홍대 클럽 등)';
