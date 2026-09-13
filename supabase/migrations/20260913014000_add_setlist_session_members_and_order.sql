-- setlists 테이블에 해당 곡 연주자 명단 및 연주 순서 컬럼 추가
ALTER TABLE public.setlists ADD COLUMN IF NOT EXISTS session_members text;
ALTER TABLE public.setlists ADD COLUMN IF NOT EXISTS order_num integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.setlists.session_members IS '해당 곡 연주자 명단 (예: 보컬: 김소크, 기타: 이준민)';
COMMENT ON COLUMN public.setlists.order_num IS '셋리스트 연주 순서 (1, 2, 3...)';
