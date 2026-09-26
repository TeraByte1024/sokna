import "server-only";

import { randomUUID } from "node:crypto";
import { getFirebaseAdminMessaging } from "@/lib/firebase/admin";
import { createServiceClient } from "@/lib/supabase/service";

const PUSH_LEASE_MS = 5 * 60_000;
export const PUSH_RETRY_WINDOW_MS = 24 * 60 * 60_000;
const PUSH_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export interface PushMessage {
	title: string;
	body: string;
	url: string;
	tag?: string;
	notificationId?: string;
	expiresAt?: number;
}

interface PushFailure {
	profileId: string;
	code: string;
	retryable: boolean;
}

export interface PushDispatchResult {
	recipientCount: number;
	tokenCount: number;
	sentCount: number;
	failureCount: number;
	successfulProfileIds: string[];
	failures: PushFailure[];
	skippedReason?: "not_opted_in" | "no_active_token";
}

interface PendingPushRow {
	id: string;
	user_id: string | null;
	title: string | null;
	body: string | null;
	link: string | null;
	created_at: string;
	push_attempted_at: string | null;
	push_sent_at: string | null;
	push_attempts: number;
	push_next_attempt_at: string;
	push_progress: unknown;
}

/** Checkpoints contain profile IDs and error codes, never registration tokens or provider messages. */
interface PushProgress {
	successfulProfileIds: string[];
	failures: PushFailure[];
}

const PUSH_ROW_FIELDS = "id, user_id, title, body, link, created_at, push_attempted_at, push_sent_at, push_attempts, push_next_attempt_at, push_progress";
const INVALID_TOKEN_CODES = new Set([
	"messaging/invalid-registration-token",
	"messaging/registration-token-not-registered",
]);
const PERMANENT_ERROR_CODES = new Set([
	...INVALID_TOKEN_CODES,
	"messaging/invalid-argument", "messaging/invalid-recipient", "messaging/invalid-payload",
	"messaging/invalid-data-payload-key", "messaging/payload-size-limit-exceeded",
	"messaging/invalid-options", "messaging/mismatched-credential", "messaging/invalid-package-name",
	"messaging/third-party-auth-error", "messaging/authentication-error",
	"app/invalid-argument", "app/invalid-app-options", "app/invalid-credential",
]);

function errorCode(error: unknown): string {
	const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
	// Error messages may contain tokens. Keep only the provider's short code.
	return typeof code === "string" && /^[a-zA-Z0-9_/-]{1,100}$/.test(code) ? code : "unknown_error";
}

function readProgress(value: unknown): PushProgress {
	const data = value && typeof value === "object" ? value as Partial<PushProgress> : {};
	return {
		successfulProfileIds: Array.isArray(data.successfulProfileIds)
			? [...new Set(data.successfulProfileIds.filter((id): id is string => typeof id === "string"))] : [],
		failures: Array.isArray(data.failures) ? data.failures.filter((failure) =>
			failure && typeof failure.profileId === "string" && typeof failure.code === "string" && typeof failure.retryable === "boolean",
		).map(({ profileId, code, retryable }) => ({ profileId, code: errorCode({ code }), retryable })) : [],
	};
}

/** Final consent/token checks apply independently to every account and every attempt. */
export async function sendPushToUsers(
	userIds: string[],
	message: PushMessage,
	excludedProfileIds: string[] = [],
): Promise<PushDispatchResult> {
	const result: PushDispatchResult = {
		recipientCount: 0, tokenCount: 0, sentCount: 0, failureCount: 0,
		successfulProfileIds: [], failures: [],
	};
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
	if (uniqueUserIds.length === 0) return { ...result, skippedReason: "not_opted_in" };
	const supabase = createServiceClient();
	const { data: users, error: userError } = await supabase.from("users").select("id")
		.in("id", uniqueUserIds).eq("marketing_opt_in", true);
	if (userError) throw userError;
	const eligibleIds = (users ?? []).map((user) => user.id);
	result.recipientCount = eligibleIds.length;
	if (eligibleIds.length === 0) return { ...result, skippedReason: "not_opted_in" };
	const { data: profiles, error: profileError } = await supabase.from("profiles")
		.select("id, fcm_token, user_id").in("user_id", eligibleIds);
	if (profileError) throw profileError;
	const tokenRows = [...new Map((profiles ?? []).filter((profile) => profile.fcm_token)
		.map((profile) => [profile.fcm_token, profile])).values()];
	result.tokenCount = tokenRows.length;
	if (tokenRows.length === 0) return { ...result, skippedReason: "no_active_token" };
	const excluded = new Set(excludedProfileIds);
	const pendingTokens = tokenRows.filter((profile) => !excluded.has(profile.id));
	if (pendingTokens.length === 0) return result;
	const appOrigin = process.env.NEXT_PUBLIC_APP_URL
		?? (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "http://localhost:3000");
	const absoluteLink = new URL(message.url, appOrigin).href;
	const tag = message.tag ?? "sokna-notification-" + randomUUID();
	const expiresAt = Math.min(message.expiresAt ?? Date.now() + PUSH_RETRY_WINDOW_MS, Date.now() + PUSH_RETRY_WINDOW_MS);
	// Every payload names one account, including callers that supply several recipients.
	for (const recipientUserId of eligibleIds) {
		const recipientTokens = pendingTokens.filter((profile) => profile.user_id === recipientUserId);
		// FCM accepts at most 500 tokens in one multicast request.
		for (let offset = 0; offset < recipientTokens.length; offset += 500) {
			const chunk = recipientTokens.slice(offset, offset + 500);
			if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
				result.failures.push(...chunk.map((profile) => ({ profileId: profile.id, code: "notification_expired", retryable: false })));
				continue;
			}
			try {
				const response = await getFirebaseAdminMessaging().sendEachForMulticast({
					tokens: chunk.map((profile) => profile.fcm_token),
					notification: { title: message.title, body: message.body },
					data: { url: message.url, tag, recipientUserId, expiresAt: String(expiresAt), ...(message.notificationId ? { notificationId: message.notificationId } : {}) },
					webpush: {
						fcmOptions: { link: absoluteLink },
						headers: { TTL: String(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))) },
						notification: { icon: "/logo_edited.png", tag, renotify: false },
					},
				});
				chunk.forEach((profile, index) => {
					const delivery = response.responses[index];
					if (delivery?.success) result.successfulProfileIds.push(profile.id);
					else {
						const code = errorCode(delivery?.error);
						result.failures.push({ profileId: profile.id, code, retryable: !PERMANENT_ERROR_CODES.has(code) });
					}
				});
			} catch (error) {
				const code = errorCode(error);
				result.failures.push(...chunk.map((profile) => ({ profileId: profile.id, code, retryable: !PERMANENT_ERROR_CODES.has(code) })));
			}
		}
	}
	const invalidFailures = result.failures.filter((failure) => INVALID_TOKEN_CODES.has(failure.code));
	for (const failure of invalidFailures) {
		const sentToken = pendingTokens.find((profile) => profile.id === failure.profileId)?.fcm_token;
		if (!sentToken) continue;
		// A concurrent refresh may replace the token on the same profile. Delete only
		// the exact token we attempted, and retry a replacement instead of excluding it.
		try {
			const { data: deleted, error } = await supabase.from("profiles").delete()
				.eq("id", failure.profileId).eq("fcm_token", sentToken).select("id");
			if (error) {
				console.warn("Expired push token cleanup failed:", errorCode(error));
				continue;
			}
			if (!deleted?.length) {
				const { data: current, error: currentError } = await supabase.from("profiles")
					.select("fcm_token").eq("id", failure.profileId).maybeSingle();
				if (currentError) console.warn("Push token rotation check failed:", errorCode(currentError));
				else if (current?.fcm_token && current.fcm_token !== sentToken) failure.retryable = true;
			}
		} catch (error) {
			console.warn("Expired push token cleanup failed:", errorCode(error));
		}
	}
	result.sentCount = result.successfulProfileIds.length;
	result.failureCount = result.failures.length;
	return result;
}

export interface PendingPushOptions {
	eventType?: string;
	eventKey?: string;
	userId?: string;
	notificationIds?: string[];
	limit?: number;
}

/**
 * One outbox processor serves immediate dispatch and cron recovery. While claimed,
 * push_next_attempt_at acts as a five-minute visibility timeout; a crash needs no reset.
 */
export async function processPendingPushNotifications(options: PendingPushOptions = {}) {
	const ids = options.notificationIds && [...new Set(options.notificationIds.filter(Boolean))];
	if (ids && ids.length === 0) return { processedCount: 0, sentCount: 0 };
	const limit = Number.isSafeInteger(options.limit) ? Math.min(500, Math.max(1, options.limit!)) : 50;
	const supabase = createServiceClient();
	let query = supabase.from("notifications").select(PUSH_ROW_FIELDS)
		.eq("push_status", "pending").lte("push_next_attempt_at", new Date().toISOString());
	if (ids) query = query.in("id", ids);
	if (options.eventType !== undefined) query = query.eq("event_type", options.eventType);
	if (options.eventKey !== undefined) query = query.eq("event_key", options.eventKey);
	if (options.userId !== undefined) query = query.eq("user_id", options.userId);
	const { data: rows, error } = await query.order("push_next_attempt_at", { ascending: true })
		.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(limit);
	if (error) throw error;
	return processPushRows(rows ?? []);
}

async function processPushRows(rows: PendingPushRow[]) {
	const supabase = createServiceClient();
	let processedCount = 0;
	let sentCount = 0;
	for (const row of rows) {
		const now = Date.now();
		const attemptedAt = new Date(now).toISOString();
		const leaseUntil = new Date(now + PUSH_LEASE_MS).toISOString();
		const attempts = row.push_attempts + 1;
		let claimQuery = supabase.from("notifications").update({
			push_attempted_at: attemptedAt, push_attempts: attempts, push_next_attempt_at: leaseUntil,
		}).eq("id", row.id).eq("push_status", "pending")
			.eq("push_next_attempt_at", row.push_next_attempt_at).lte("push_next_attempt_at", attemptedAt);
		claimQuery = row.push_attempted_at
			? claimQuery.eq("push_attempted_at", row.push_attempted_at)
			: claimQuery.is("push_attempted_at", null);
		const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
		if (claimError) throw claimError;
		if (!claimed) continue;
		const progress = readProgress(row.push_progress);
		const expiresAt = Date.parse(row.created_at) + PUSH_RETRY_WINDOW_MS;
		let status: "accepted" | "skipped" | "pending" | "failed";
		let reason: string | null = null;
		let newlySent = 0;
		if (!row.user_id) {
			status = "skipped";
			reason = "missing_user_id";
		} else if (!Number.isFinite(expiresAt) || now >= expiresAt) {
			status = "failed";
			reason = "retry_window_expired";
		} else {
			try {
				const result = await sendPushToUsers([row.user_id], {
					title: row.title ?? "소크나 알림", body: row.body ?? "새로운 알림이 도착했습니다.",
					url: row.link ?? "/", tag: "sokna-notification-" + row.id, notificationId: row.id, expiresAt,
				}, [...progress.successfulProfileIds, ...progress.failures.filter((failure) => !failure.retryable).map((failure) => failure.profileId)]);
				newlySent = result.sentCount;
				progress.successfulProfileIds = [...new Set([...progress.successfulProfileIds, ...result.successfulProfileIds])];
				progress.failures = [...progress.failures.filter((failure) => !failure.retryable), ...result.failures];
				if (result.failures.some((failure) => failure.retryable)) {
					status = Date.now() >= expiresAt ? "failed" : "pending";
					reason = status === "failed" ? "retry_window_expired" : "retryable_delivery_failure";
				} else if (progress.failures.length > 0) {
					status = "failed";
					reason = "permanent_delivery_failure";
				} else if (result.skippedReason) {
					status = "skipped";
					reason = result.skippedReason;
				} else {
					status = "accepted";
				}
			} catch (error) {
				const code = errorCode(error);
				status = PERMANENT_ERROR_CODES.has(code) || Date.now() >= expiresAt ? "failed" : "pending";
				reason = Date.now() >= expiresAt ? "retry_window_expired" : code;
			}
		}
		const delay = PUSH_RETRY_BACKOFF_MS[Math.min(attempts - 1, PUSH_RETRY_BACKOFF_MS.length - 1)];
		const nextAttemptAt = status === "pending" ? new Date(Math.min(
			Date.now() + delay + Math.floor(delay * Math.random() * 0.2), expiresAt,
		)).toISOString() : leaseUntil;
		const { data: finished, error: updateError } = await supabase.from("notifications").update({
			push_status: status, push_sent_at: newlySent > 0 ? attemptedAt : row.push_sent_at,
			push_progress: { successfulProfileIds: progress.successfulProfileIds, failures: progress.failures.map((failure) => ({ ...failure })) },
			push_error: reason, push_next_attempt_at: nextAttemptAt,
		}).eq("id", row.id).eq("push_status", "pending").eq("push_attempted_at", attemptedAt)
			.eq("push_next_attempt_at", leaseUntil).select("id").maybeSingle();
		// Failed writes keep the lease; an older worker cannot overwrite its successor.
		if (updateError) throw updateError;
		if (!finished) continue;
		processedCount++;
		sentCount += newlySent;
	}
	return { processedCount, sentCount };
}
