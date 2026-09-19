-- nominations 테이블에 악보 관련 추가 메모 컬럼 추가
ALTER TABLE public.nominations
ADD COLUMN IF NOT EXISTS sheet_note text DEFAULT '';

COMMENT ON COLUMN public.nominations.sheet_note IS '악보 관련 추가 메모 및 안내 사항 (보유 파트, 키 정보, 링크 등)';
