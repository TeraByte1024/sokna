-- 선곡 회의 후보곡 추천 보컬 (JSONB 목록)
ALTER TABLE public.setlists ADD COLUMN IF NOT EXISTS recommended_vocals jsonb DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.setlists.recommended_vocals IS '선곡 회의 후보곡 추천 보컬 목록 ([{ id: number, name: string, generation?: number, part?: string }])';
