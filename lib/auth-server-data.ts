import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** 페이지와 관리자 판정이 검증된 사용자 조회를 한 요청 안에서 공유합니다. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});
