"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** 회원 본인의 프로필(이름, 기수, 세션, 마케팅 동의) 수정 액션 */
export async function updateMyProfileAction(
  name: string,
  generation: number,
  part?: string | null,
  marketingOptIn?: boolean
): Promise<ProfileActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, error: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요." };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: "이름(실명)을 입력해 주세요." };
    }

    if (isNaN(generation) || generation < 1) {
      return { ok: false, error: "올바른 기수를 입력해 주세요. (1 이상의 숫자)" };
    }

    const trimmedPart = part?.trim() || null;

    // 본인(auth.uid() = id)의 users 정보 업데이트 (status나 id 등 보안 필드는 수정하지 않음)
    const { error: updateError } = await supabase
      .from("users")
      .update({
        name: trimmedName,
        generation,
        part: trimmedPart,
        marketing_opt_in: Boolean(marketingOptIn),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("내 프로필 업데이트 실패:", updateError);
      return { ok: false, error: updateError.message };
    }

    // 만약 사용자가 관리자(admins 테이블)인 경우 이름 동기화
    try {
      await supabase
        .from("admins")
        .update({ name: trimmedName })
        .eq("id", user.id);
    } catch {
      // admins 테이블에 존재하지 않을 수 있으므로 무시
    }

    revalidatePath("/profile");
    revalidatePath("/members");
    revalidatePath("/admin/members");
    revalidatePath("/", "layout");

    return { ok: true, message: "회원 정보가 성공적으로 수정되었습니다." };
  } catch (err) {
    console.error("updateMyProfileAction 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}
