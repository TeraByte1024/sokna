"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { processPendingPushNotifications } from "@/lib/push-notifications";
import { savePushConsent } from "@/lib/push-consent";

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
      return { ok: false, error: "세션을 입력해 주세요." };
    }

    const appliedAt = new Date().toISOString();
    // 신청과 관리자 알림을 DB 트리거가 같은 트랜잭션으로 저장합니다.
    const { error: upsertError } = await savePushConsent(supabase, user.id, marketingOptIn, {
      application: {
        email: user.email ?? null,
        name: trimmedName,
        generation,
        part: trimmedPart,
        applied_at: appliedAt,
      },
    });

    if (upsertError) {
      console.error("프로필 완성 실패:", upsertError);
      return { ok: false, error: upsertError.message };
    }

    // 신청 저장 트리거가 만든 알림만 즉시 발송합니다.
    try {
      await processPendingPushNotifications({
        eventType: "member_approval_requested",
        eventKey: `member-application:${user.id}:${appliedAt}`,
      });
    } catch (pushError) {
      console.warn("가입 승인 요청 즉시 푸시 실패, 재시도 대기:", pushError);
    }

    revalidatePath("/admin/members");
    revalidatePath("/admin/approvals");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("completeProfileAction 예외:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}
