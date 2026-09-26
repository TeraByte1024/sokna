"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** 검증된 세션의 본인 계정만 삭제합니다. 사용자 ID는 입력받지 않습니다. */
export async function deleteMyAccountAction(
  confirmation: string
): Promise<ProfileActionResult> {
  if (confirmation !== "탈퇴") {
    return { ok: false, error: "확인 문구 '탈퇴'를 정확히 입력해 주세요." };
  }

  let supabase;
  try {
    supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { ok: false, error: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요." };
    }

    const { data, error } = await supabase.rpc("delete_my_account", {
      p_confirmation: confirmation,
    });
    if (error || data !== true) {
      console.error("회원 탈퇴 실패:", error);
      return {
        ok: false,
        error: error?.code === "P0001"
          ? "마지막 관리자는 탈퇴할 수 없습니다. 다른 관리자를 지정한 뒤 다시 시도해 주세요."
          : "회원 탈퇴에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
  } catch (error) {
    console.error("deleteMyAccountAction 예외:", error);
    return { ok: false, error: "회원 탈퇴에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  // 여기부터 계정 삭제는 완료된 상태입니다. 후속 오류 때문에 삭제를 재시도하게 하지 않습니다.
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) console.error("탈퇴 후 세션 정리 실패:", error);
  } catch (error) {
    console.error("탈퇴 후 세션 정리 예외:", error);
  }
  try {
    revalidatePath("/", "layout");
  } catch (error) {
    console.error("탈퇴 후 캐시 갱신 실패:", error);
  }
  return { ok: true };
}

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

    // 수신 동의를 철회하면 등록된 모든 기기 토큰도 즉시 제거합니다.
    if (!marketingOptIn) {
      const { error: tokenDeleteError } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", user.id);
      if (tokenDeleteError) {
        console.error("푸시 토큰 삭제 실패:", tokenDeleteError);
        return { ok: false, error: "수신 동의는 변경됐지만 푸시 토큰 해제에 실패했습니다." };
      }
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
