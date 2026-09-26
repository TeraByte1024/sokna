import "server-only";

import { createClient } from "@/lib/supabase/server";

export const NOTIFICATION_PAGE_SIZE = 20;
export interface NotificationCursor { created_at: string; id: string }
export interface NotificationInboxItem {
	id: string;
	title: string | null;
	body: string | null;
	link: string | null;
	created_at: string;
	read_at: string | null;
}
export type NotificationClient = Awaited<ReturnType<typeof createClient>>;
export class NotificationRequestError extends Error {}

export async function getNotificationContext(expectedUserId?: string) {
	const supabase = await createClient();
	const { data: { user }, error } = await supabase.auth.getUser();
	if (error || !user) throw new NotificationRequestError("로그인이 필요합니다. 다시 로그인해 주세요.");
	if (expectedUserId !== undefined && expectedUserId !== user.id) throw new NotificationRequestError("로그인 계정이 변경되었습니다. 알림을 다시 열어 주세요.");
	return { supabase, userId: user.id };
}

export async function countUnreadNotifications(supabase: NotificationClient, userId: string) {
	const { count, error } = await supabase.from("notifications")
		.select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
	if (error || typeof count !== "number") throw new NotificationRequestError("읽지 않은 알림 수를 확인하지 못했습니다.");
	return count;
}

/** SSR errors remain distinguishable from a confirmed empty inbox. */
export async function getUnreadNotificationCount(expectedUserId: string): Promise<number | null> {
	try {
		const { supabase, userId } = await getNotificationContext(expectedUserId);
		return await countUnreadNotifications(supabase, userId);
	} catch { return null; }
}

export function notificationLink(link: string | null): string | null {
	if (!link) return null;
	try {
		if (!link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return "/";
		const parsed = new URL(link, "https://sokna.invalid");
		return parsed.origin === "https://sokna.invalid" ? parsed.pathname + parsed.search + parsed.hash : "/";
	} catch { return "/"; }
}

export function isNotificationId(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Preserve database microseconds while rejecting PostgREST filter metacharacters. */
export function isNotificationTimestamp(value: unknown): value is string {
	return typeof value === "string"
		&& /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
		&& Number.isFinite(Date.parse(value));
}
