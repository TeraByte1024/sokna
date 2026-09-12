"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";

export type GigActionResult = { ok: true } | { ok: false; error: string };

/** 빈 문자열을 null로 변환하는 헬퍼 함수 */
function emptyToNull(s: FormDataEntryValue | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

export async function createGig(formData: FormData): Promise<GigActionResult> {
  const allowed = await getIsAdmin();
  if (!allowed) return { ok: false, error: "관리자만 접근 가능합니다." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "공연 제목은 필수입니다." };

  const perform_date = emptyToNull(formData.get("perform_date"));
  if (!perform_date) return { ok: false, error: "공연 일시는 필수입니다." };
  const meeting_date = emptyToNull(formData.get("meeting_date"));

  // 프론트엔드에서 전달된 참여자 JSON 파싱
  const rawPerformers = formData.get("performers") as string;
  let performersList: { id?: string; name: string; email?: string }[] = [];

  try {
    performersList = rawPerformers ? JSON.parse(rawPerformers) : [];
  } catch (e) {
    console.error("참여자 데이터 파싱 실패:", e);
  }

  const supabase = await createClient();

  // 1. 공연(Gig) 정보 먼저 삽입
  // select()를 붙여야 생성된 gig의 ID를 가져올 수 있습니다.
  const { data: newGig, error: gigError } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .insert({
      title,
      perform_date,
      meeting_date,
    })
    .select()
    .single();

  if (gigError) return { ok: false, error: gigError.message };

  // 2. 참여자 매핑 데이터 준비 (N:M 관계)
  if (performersList.length > 0) {
    const mappingData = performersList
      .filter((p): p is { id: string; name: string; email?: string } => Boolean(p.id && !p.email?.startsWith("temp-")))
      .map((p) => ({
        gig_id: newGig.id,
        user_id: p.id,
        part: "세션",
      }));

    if (mappingData.length > 0) {
      const { error: mappingError } = await supabase
        .from("performers") // 매핑 테이블 이름
        .insert(mappingData);

      if (mappingError) {
        console.error("매핑 저장 실패:", mappingError);
        // 공연은 생성되었으므로 부분 성공으로 간주하거나, 
        // 전체를 취소하고 싶다면 여기서 추가 처리가 필요합니다.
      }
    }
  }

  revalidatePath("/gigs");
  return { ok: true };
}