"use server";

import { processPendingPushNotifications } from "@/lib/push-notifications";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Email confirmation can leave a successful signup without a login session.
 * Wake only that application's durable outbox, using the database timestamp;
 * never expose whether a supplied account exists or how many admins received it.
 */
export async function dispatchSignupPushNotificationsAction(applicantId?: string | null) {
	if (typeof applicantId !== "string" || !UUID_PATTERN.test(applicantId)) {
		return { ok: true as const };
	}
	try {
		const userId = applicantId.toLowerCase();
		const supabase = createServiceClient();
		const { data: applicant, error } = await supabase.from("users")
			.select("applied_at").eq("id", userId).maybeSingle();
		if (error) throw error;
		if (!applicant) return { ok: true as const };

		const appliedAt = new Date(applicant.applied_at).toISOString();
		await processPendingPushNotifications({
			eventType: "member_approval_requested",
			eventKey: `member-application:${userId}:${appliedAt}`,
		});
		return { ok: true as const };
	} catch (error) {
		console.error("가입 승인 요청 즉시 푸시 실패:", error);
		return { ok: false as const, error: "가입 요청은 완료됐지만 관리자 푸시 발송이 지연되고 있습니다." };
	}
}
