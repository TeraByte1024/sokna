-- gigs 테이블에 공연 시작 시각(perform_time) 및 선곡회의 시작 시각(meeting_time) 컬럼 추가
ALTER TABLE gigs
ADD COLUMN IF NOT EXISTS perform_time text NULL,
ADD COLUMN IF NOT EXISTS meeting_time text NULL;

COMMENT ON COLUMN gigs.perform_time IS '공연 시작 시각 (24시간제 HH:mm, 예: 19:00)';
COMMENT ON COLUMN gigs.meeting_time IS '선곡회의 시작 시각 (24시간제 HH:mm, 예: 14:00)';

-- analog. 공연(id: 2)의 공연 시각을 포스터에 명시된 19:00으로 설정
UPDATE gigs
SET perform_time = '19:00'
WHERE id = 2 AND perform_time IS NULL;
