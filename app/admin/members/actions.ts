"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { processPendingApprovalPushNotification } from "@/lib/push-notifications";

export type AdminMember = {
  id: string;
  name: string;
  generation: number | null;
  part: string | null;
  email: string | null;
  status: string;
  applied_at: string;
  approved_at: string | null;
  marketing_opt_in: boolean;
};

export type AdminRecord = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
};

export type AdminActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** 승인 대기 중인 회원 목록 조회 */
export async function getPendingMembersAction(): Promise<{
  ok: boolean;
  data?: AdminMember[];
  error?: string;
}> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근할 수 있습니다." };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, name, generation, part, email, status, applied_at, approved_at, marketing_opt_in")
      .eq("status", "pending")
      .order("applied_at", { ascending: false });

    if (error) {
      console.error("대기 회원 목록 조회 실패:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true, data: (data ?? []) as AdminMember[] };
  } catch (err) {
    console.error("대기 회원 조회 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

/** 회원가입 승인 처리 */
export async function approveMemberAction(
  userId: string
): Promise<AdminActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근할 수 있습니다." };
    }

    const supabase = await createClient();
    const { data: approved, error: approveError } = await supabase.rpc(
      "approve_member_with_notification",
      { p_user_id: userId },
    );

    if (approveError) {
      console.error("회원 승인 실패:", approveError);
      return { ok: false, error: approveError.message };
    }

    if (!approved) {
      return { ok: false, error: "승인 대기 중인 회원을 찾을 수 없습니다." };
    }

    try {
      await processPendingApprovalPushNotification(userId);
    } catch (pushError) {
      // 승인은 이미 DB 트랜잭션으로 완료됐으므로 성공을 유지합니다.
      // pending outbox는 cron이 복구합니다.
      console.warn("승인 완료 즉시 푸시 실패, cron 재시도 대기:", pushError);
    }

    revalidatePath("/admin/members");
    revalidatePath("/members");
    return { ok: true, message: "회원가입이 승인되었습니다." };
  } catch (err) {
    console.error("회원 승인 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

/** 회원가입 거절(반려) 처리 */
export async function rejectMemberAction(
  userId: string
): Promise<AdminActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근할 수 있습니다." };
    }

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        status: "rejected",
      })
      .eq("id", userId);

    if (updateError) {
      console.error("회원 거절 실패:", updateError);
      return { ok: false, error: updateError.message };
    }

    revalidatePath("/admin/members");
    return { ok: true, message: "가입 신청이 거절되었습니다." };
  } catch (err) {
    console.error("회원 거절 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

/** 일반 회원에게 관리자 권한 부여 */
export async function grantAdminAction(
  userId: string
): Promise<AdminActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근할 수 있습니다." };
    }

    const supabase = await createClient();

    // 회원 정보 확인
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return { ok: false, error: "회원 정보를 찾을 수 없습니다." };
    }

    const trimmedEmail = user.email?.trim();
    if (!trimmedEmail) {
      return {
        ok: false,
        error: "이메일 정보가 없는 회원은 관리자로 임명할 수 없습니다.",
      };
    }

    // 이미 관리자로 등록되어 있는지 확인
    const { data: existing } = await supabase
      .from("admins")
      .select("id")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (existing) {
      return { ok: false, error: "이미 관리자로 등록된 회원입니다." };
    }

    // admins 테이블에 추가
    const { error: insertError } = await supabase.from("admins").insert({
      id: user.id,
      email: trimmedEmail,
      name: user.name,
    });

    if (insertError) {
      console.error("관리자 권한 부여 실패:", insertError);
      return { ok: false, error: insertError.message };
    }

    // 대상자에게 알림 전송
    try {
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "관리자 권한 부여 안내",
        body: "소크나 관리자 권한이 부여되었습니다. 이제 회원 관리 및 공연 관리가 가능합니다.",
        link: "/admin/members",
        created_at: new Date().toISOString(),
      });
    } catch (notiErr) {
      console.warn("관리자 부여 알림 실패 건너뜀:", notiErr);
    }

    revalidatePath("/admin/members");
    return { ok: true, message: `${user.name} 님에게 관리자 권한을 부여했습니다.` };
  } catch (err) {
    console.error("관리자 권한 부여 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

/** 관리자 권한 해제 */
export async function revokeAdminAction(
  adminRecordId: string
): Promise<AdminActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근할 수 있습니다." };
    }

    const supabase = await createClient();

    // 1. 전체 관리자 수 확인 (최소 1명 유지 필수)
    const { count, error: countError } = await supabase
      .from("admins")
      .select("id", { count: "exact", head: true });

    if (countError || (count ?? 0) <= 1) {
      return {
        ok: false,
        error: "시스템에 최소 1명의 관리자가 유지되어야 하므로 해제할 수 없습니다.",
      };
    }

    // 2. 현재 요청자 본인인지 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: targetAdmin } = await supabase
      .from("admins")
      .select("id, email, name")
      .eq("id", adminRecordId)
      .single();

    if (!targetAdmin) {
      return { ok: false, error: "해당 관리자 레코드를 찾을 수 없습니다." };
    }

    if (user?.email && user.email.toLowerCase() === targetAdmin.email.toLowerCase()) {
      return {
        ok: false,
        error: "본인의 관리자 권한은 스스로 해제할 수 없습니다. 다른 관리자에게 요청하세요.",
      };
    }

    // 3. admins 테이블에서 삭제
    const { error: deleteError } = await supabase
      .from("admins")
      .delete()
      .eq("id", adminRecordId);

    if (deleteError) {
      console.error("관리자 해제 실패:", deleteError);
      return { ok: false, error: deleteError.message };
    }

    revalidatePath("/admin/members");
    return {
      ok: true,
      message: `${targetAdmin.name || targetAdmin.email} 님의 관리자 권한을 해제했습니다.`,
    };
  } catch (err) {
    console.error("관리자 해제 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

/** 관리자 권한으로 부원 정보(이름, 기수, 세션) 수정 */
export async function updateMemberByAdminAction(
  userId: string,
  name: string,
  generation: number,
  part?: string | null
): Promise<AdminActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근할 수 있습니다." };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: "이름은 필수 항목입니다." };
    }

    if (generation < 1) {
      return { ok: false, error: "기수는 1 이상이어야 합니다." };
    }

    const trimmedPart = part?.trim() || null;

    const supabase = await createClient();

    // 1. users 테이블 업데이트
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        name: trimmedName,
        generation,
        part: trimmedPart,
      })
      .eq("id", userId);

    if (userUpdateError) {
      console.error("회원 정보 수정 실패:", userUpdateError);
      return { ok: false, error: userUpdateError.message };
    }

    // 2. 만약 해당 회원이 admins 테이블에도 등록되어 있다면 이름 동기화
    try {
      await supabase
        .from("admins")
        .update({ name: trimmedName })
        .eq("id", userId);
    } catch {
      // admins 테이블에 없을 수 있으므로 무시
    }

    revalidatePath("/admin/members");
    revalidatePath("/members");
    revalidatePath("/", "layout");
    return { ok: true, message: `${trimmedName} 님의 회원 정보를 수정했습니다.` };
  } catch (err) {
    console.error("회원 정보 수정 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}
