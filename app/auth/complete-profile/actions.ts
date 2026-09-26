"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { processPendingPushNotificationsByIds } from "@/lib/push-notifications";

export type CompleteProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function completeProfileAction(
  name: string,
  generation: number,
  part: string,
  marketingOptIn: boolean
): Promise<CompleteProfileResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요." };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: "이름(실명)을 입력해 주세요." };
    }

    if (!Number.isInteger(generation) || generation < 1) {
      return { ok: false, error: "올바른 기수를 입력해 주세요." };
    }

    const trimmedPart = part.trim();
    if (!trimmedPart) {
      return { ok: false, error: "세션(파트)을 입력해 주세요." };
    }

    // public.users 테이블에 업데이트 (또는 신규 등록)
    const { error: upsertError } = await supabase.from("users").upsert({
      id: user.id,
      email: user.email ?? null,
      name: trimmedName,
      generation,
      part: trimmedPart,
      status: "pending",
      marketing_opt_in: marketingOptIn,
      applied_at: new Date().toISOString(),
    });

    if (upsertError) {
      console.error("프로필 완성 실패:", upsertError);
      return { ok: false, error: upsertError.message };
    }

    // 관리자들에게 알림 전송
    try {
      const serviceClient = createServiceClient();
      const { data: admins } = await serviceClient.from("admins").select("id");
      if (admins && admins.length > 0) {
        const notis = admins.map((admin) => ({
          user_id: admin.id,
          title: "신규 회원가입 승인 요청 (Google)",
          body: `${trimmedName} (${generation}기, ${trimmedPart})님이 Google 계정으로 가입 승인을 요청했습니다.`,
          link: "/admin/members",
          push_eligible: true,
        }));
        const { data: insertedNotifications, error: notificationError } = await serviceClient
          .from("notifications")
          .insert(notis)
          .select("id");
        if (notificationError) throw notificationError;

        await processPendingPushNotificationsByIds(
          (insertedNotifications ?? []).map((notification) => notification.id),
        );
      }
    } catch (notiErr) {
      console.warn("관리자 알림 실패 건너뜀:", notiErr);
    }

    revalidatePath("/admin/members");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("completeProfileAction 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}
