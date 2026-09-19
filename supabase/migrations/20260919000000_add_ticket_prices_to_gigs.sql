-- gigs 테이블에 사전예매 및 현장예매 티켓 가격 컬럼 추가
ALTER TABLE public.gigs
ADD COLUMN IF NOT EXISTS advance_ticket_price integer NULL,
ADD COLUMN IF NOT EXISTS door_ticket_price integer NULL;

COMMENT ON COLUMN public.gigs.advance_ticket_price IS '사전예매 티켓 가격 (KRW, 정수)';
COMMENT ON COLUMN public.gigs.door_ticket_price IS '현장예매 티켓 가격 (KRW, 정수)';
