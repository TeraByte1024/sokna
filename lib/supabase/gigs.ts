/**
 * Supabase에서 만든 공연(Gigs) 테이블 이름과 동일해야 합니다.
 * 대문자 `Gigs`만 있으면 NEXT_PUBLIC_SUPABASE_GIGS_TABLE=Gigs 로 지정하세요.
 */
export const SUPABASE_GIGS_TABLE =
  process.env.NEXT_PUBLIC_SUPABASE_GIGS_TABLE ?? "gigs";
