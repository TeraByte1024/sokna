import "server-only";

import { getFirebaseAdminMessaging } from "@/lib/firebase/admin";
import { createServiceClient } from "@/lib/supabase/service";

export interface PushMessage {
	title: string;
	body: string;
	url: string;
	tag?: string;
}

export interface PushDispatchResult {
	recipientCount: number;
	tokenCount: number;
	sentCount: number;
	failureCount: number;
}

interface PendingPushRow {
	id: string;
	user_id: string | null;
	title: string | null;
	body: string | null;
	link: string | null;
}

const INVALID_TOKEN_CODES = new Set([
	"messaging/invalid-registration-token",
	"messaging/registration-token-not-registered",
]);

/**
 * 서버에서 최종 수신 대상을 다시 검사하고 FCM으로 발송합니다.
 * 마케팅 수신에 동의하지 않은 사용자는 caller 입력과 무관하게 제외됩니다.
 */
export async function sendPushToUsers(
	userIds: string[],
	message: PushMessage,
): Promise<PushDispatchResult> {
	const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
	if (uniqueUserIds.length === 0) {
		return { recipientCount: 0, tokenCount: 0, sentCount: 0, failureCount: 0 };
	}

	const supabase = createServiceClient();
	const { data: optedInUsers, error: userError } = await supabase
		.from("users")
		.select("id")
		.in("id", uniqueUserIds)
		.eq("marketing_opt_in", true);

	if (userError) throw userError;

	const eligibleIds = (optedInUsers ?? []).map((user) => user.id);
	if (eligibleIds.length === 0) {
		return { recipientCount: 0, tokenCount: 0, sentCount: 0, failureCount: 0 };
	}

	const { data: profiles, error: profileError } = await supabase
		.from("profiles")
		.select("id, fcm_token")
		.in("user_id", eligibleIds);

	if (profileError) throw profileError;

	const tokenRows = Array.from(
		new Map((profiles ?? []).map((profile) => [profile.fcm_token, profile])).values(),
	);
	if (tokenRows.length === 0) {
		return {
			recipientCount: eligibleIds.length,
			tokenCount: 0,
			sentCount: 0,
			failureCount: 0,
		};
	}

	const appOrigin = process.env.NEXT_PUBLIC_APP_URL
		?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
	const absoluteLink = new URL(message.url, appOrigin).href;
	const response = await getFirebaseAdminMessaging().sendEachForMulticast({
		tokens: tokenRows.map((profile) => profile.fcm_token),
		notification: { title: message.title, body: message.body },
		data: {
			url: message.url,
			tag: message.tag ?? "sokna-notification",
		},
		webpush: {
			fcmOptions: { link: absoluteLink },
			notification: {
				icon: "/logo_edited.png",
				tag: message.tag ?? "sokna-notification",
			},
		},
	});

	const invalidProfileIds = response.responses.flatMap((result, index) => {
		const code = result.error?.code;
		return !result.success && code && INVALID_TOKEN_CODES.has(code)
			? [tokenRows[index].id]
			: [];
	});

	if (invalidProfileIds.length > 0) {
		await supabase.from("profiles").delete().in("id", invalidProfileIds);
	}

	return {
		recipientCount: eligibleIds.length,
		tokenCount: tokenRows.length,
		sentCount: response.successCount,
		failureCount: response.failureCount,
	};
}

async function processPushRows(
	rows: PendingPushRow[],
	options: { retryWithCron?: boolean } = {},
) {
	const supabase = createServiceClient();
	let processedCount = 0;
	let sentCount = 0;

	for (const row of rows) {
		const claimed = await supabase
			.from("notifications")
			.update({ push_status: "processing", push_attempted_at: new Date().toISOString() })
			.eq("id", row.id)
			.eq("push_status", "pending")
			.select("id")
			.maybeSingle();

		if (!claimed.data) continue;

		try {
			if (!row.user_id) {
				await supabase
					.from("notifications")
					.update({ push_status: "skipped", push_error: "missing_user_id" })
					.eq("id", row.id);
				processedCount++;
				continue;
			}

			const result = await sendPushToUsers([row.user_id], {
				title: row.title ?? "소크나 알림",
				body: row.body ?? "새로운 알림이 도착했습니다.",
				url: row.link ?? "/",
			});

			const status = result.sentCount > 0 ? "sent" : "skipped";
			await supabase
				.from("notifications")
				.update({
					push_status: status,
					push_sent_at: result.sentCount > 0 ? new Date().toISOString() : null,
					push_error:
						result.sentCount > 0 ? null : "not_opted_in_or_no_active_token",
				})
				.eq("id", row.id);

			processedCount++;
			sentCount += result.sentCount;
		} catch (pushError) {
			const message = pushError instanceof Error ? pushError.message : "unknown_error";
			await supabase
				.from("notifications")
				.update({
					push_status: options.retryWithCron ? "pending" : "failed",
					push_error: message.slice(0, 500),
				})
				.eq("id", row.id);
			processedCount++;
		}
	}

	return { processedCount, sentCount };
}

/** notifications 테이블의 푸시 대상 레코드를 실제 FCM 발송으로 소진합니다. */
export async function processPendingPushNotifications(limit = 50) {
	const supabase = createServiceClient();
	const { data: rows, error } = await supabase
		.from("notifications")
		.select("id, user_id, title, body, link")
		.eq("push_eligible", true)
		.eq("push_status", "pending")
		.order("created_at", { ascending: true })
		.limit(limit);

	if (error) throw error;
	return processPushRows(rows ?? []);
}

/** 이벤트 생성 직후 반환받은 outbox ID만 즉시 발송합니다. */
export async function processPendingPushNotificationsByIds(notificationIds: string[]) {
	const uniqueIds = Array.from(new Set(notificationIds.filter(Boolean)));
	if (uniqueIds.length === 0) return { processedCount: 0, sentCount: 0 };

	const supabase = createServiceClient();
	const { data: rows, error } = await supabase
		.from("notifications")
		.select("id, user_id, title, body, link")
		.in("id", uniqueIds)
		.eq("push_eligible", true)
		.eq("push_status", "pending");

	if (error) throw error;
	return processPushRows(rows ?? [], { retryWithCron: true });
}

/** 이메일 가입 DB 트리거가 만든 관리자 승인 요청 outbox를 즉시 발송합니다. */
export async function processPendingSignupPushNotifications(limit = 20) {
	const supabase = createServiceClient();
	const { data: rows, error } = await supabase
		.from("notifications")
		.select("id, user_id, title, body, link")
		.eq("push_eligible", true)
		.eq("push_status", "pending")
		.in("title", ["신규 회원가입 승인 요청", "신규 회원가입 승인 요청 (Google)"])
		.order("created_at", { ascending: true })
		.limit(limit);

	if (error) throw error;
	return processPushRows(rows ?? [], { retryWithCron: true });
}

/** 관리자 승인 트랜잭션이 만든 특정 사용자의 승인 완료 outbox를 즉시 발송합니다. */
export async function processPendingApprovalPushNotification(userId: string) {
	const supabase = createServiceClient();
	const { data: rows, error } = await supabase
		.from("notifications")
		.select("id, user_id, title, body, link")
		.eq("user_id", userId)
		.eq("title", "회원가입 승인 완료")
		.eq("push_eligible", true)
		.eq("push_status", "pending")
		.order("created_at", { ascending: false })
		.limit(1);

	if (error) throw error;
	return processPushRows(rows ?? [], { retryWithCron: true });
}
