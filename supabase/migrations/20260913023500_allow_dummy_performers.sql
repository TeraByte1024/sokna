-- performers 테이블에 미연동(더미) 공연자 저장을 위한 스키마 변경
-- 1. user_id를 NULL 가능하도록 변경 (미연동 상태 허용)
ALTER TABLE public.performers 
ALTER COLUMN user_id DROP NOT NULL;

-- 2. 미연동 공연자 이름(name) 컬럼 추가
ALTER TABLE public.performers 
ADD COLUMN IF NOT EXISTS name text NULL;

COMMENT ON COLUMN public.performers.name IS '미연동 또는 직접 입력된 공연자 이름 (user_id가 NULL일 때 사용)';
COMMENT ON COLUMN public.performers.user_id IS '회원 ID (미연동 더미일 경우 NULL)';
