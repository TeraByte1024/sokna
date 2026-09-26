-- Supabase의 기본 함수 권한이 anon에 직접 EXECUTE를 부여할 수 있으므로
-- PUBLIC 권한 회수와 별도로 비로그인 역할의 권한도 명시적으로 회수합니다.
REVOKE ALL ON FUNCTION public.review_gig_rsvp(bigint, bigint, timestamptz, text) FROM anon;
