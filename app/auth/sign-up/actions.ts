"use server";

import { processPendingSignupPushNotifications } from "@/lib/push-notifications";

/**
 * 이메일 가입은 auth.users DB 트리거가 관리자 outbox를 생성합니다.
 * 가입 요청 직후 이 액션이 가입 관련 pending 레코드만 즉시 소진하며,
 * 실패 시 레코드는 cron 복구 경로에 남습니다.
 */
export async function dispatchSignupPushNotificationsAction() {
	try {
		const result = await processPendingSignupPushNotifications();
		return { ok: true as const, ...result };
	} catch (error) {
		console.error("가입 승인 요청 즉시 푸시 실패:", error);
		return { ok: false as const, error: "가입 요청은 완료됐지만 관리자 푸시 발송이 지연되고 있습니다." };
	}
}
