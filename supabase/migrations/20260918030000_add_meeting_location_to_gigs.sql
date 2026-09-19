-- gigs 테이블에 선곡회의 장소(meeting_location) 컬럼 추가
ALTER TABLE public.gigs
ADD COLUMN IF NOT EXISTS meeting_location text NULL;

COMMENT ON COLUMN public.gigs.meeting_location IS '선곡회의 장소 (예: 동아리방, 학생회관 301호 등)';
