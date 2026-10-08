import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";

/** 메타데이터와 페이지 본문에서 같은 공연을 한 요청에 한 번만 조회합니다. */
export const getGigRow = cache(async (id: number) => {
  const supabase = await createClient();
  return supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
});

/** 선곡회의 메타데이터와 본문에 필요한 공연 정보만 요청 단위로 조회합니다. */
export const getNominationGigRow = cache(async (id: number) => {
  const supabase = await createClient();
  return supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("title, meeting_date, meeting_location, nomination_deadline")
    .eq("id", id)
    .maybeSingle();
});
