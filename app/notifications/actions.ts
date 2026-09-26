"use server";

import { createServiceClient } from "@/lib/supabase/service";
import {
	countUnreadNotifications, getNotificationContext, isNotificationId,
	isNotificationTimestamp, notificationLink, NOTIFICATION_PAGE_SIZE,
	NotificationRequestError,
	type NotificationCursor, type NotificationInboxItem,
} from "@/lib/notifications";

export type NotificationListResult = {
	ok: true; userId: string; items: NotificationInboxItem[]; unreadCount: number;
	nextCursor: NotificationCursor | null; cutoff: string;
} | { ok: false; error: string };
export type NotificationReadResult = {
	ok: true; userId: string; unreadCount: number; readAt: string;
} | { ok: false; error: string };

export type NotificationDeleteResult = {
	ok: true; userId: string; unreadCount: number;
} | { ok: false; error: string };

export async function listNotificationsAction(input: {
	cursor?: NotificationCursor | null; cutoff?: string; expectedUserId?: string;
} = {}): Promise<NotificationListResult> {
	try {
		if (!input || typeof input !== "object") return { ok: false, error: "알림 조회 조건이 올바르지 않습니다." };
		const { cursor } = input;
		if (cursor && (!isNotificationTimestamp(cursor.created_at) || !isNotificationId(cursor.id))) return { ok: false, error: "알림 목록 위치가 올바르지 않습니다. 다시 열어 주세요." };
		const cutoff = input.cutoff ?? new Date().toISOString();
		if (!isNotificationTimestamp(cutoff) || Date.parse(cutoff) > Date.now() + 1_000) return { ok: false, error: "알림 조회 시각이 올바르지 않습니다." };
		const { supabase, userId } = await getNotificationContext(input.expectedUserId);
		let query = supabase.from("notifications").select("id, title, body, link, created_at, read_at")
			.eq("user_id", userId).lte("created_at", cutoff);
		if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
		const [rows, unreadCount] = await Promise.all([
			query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(NOTIFICATION_PAGE_SIZE + 1),
			countUnreadNotifications(supabase, userId),
		]);
		if (rows.error) return { ok: false, error: "알림 목록을 불러오지 못했습니다. 다시 시도해 주세요." };
		const allRows = rows.data ?? [];
		const items = allRows.slice(0, NOTIFICATION_PAGE_SIZE).map((item) => ({ ...item, link: notificationLink(item.link) }));
		const last = items.at(-1);
		return { ok: true, userId, items, unreadCount, cutoff,
			nextCursor: allRows.length > NOTIFICATION_PAGE_SIZE && last ? { created_at: last.created_at, id: last.id } : null };
	} catch (error) {
		return { ok: false, error: error instanceof NotificationRequestError ? error.message : "알림 목록을 불러오지 못했습니다. 다시 시도해 주세요." };
	}
}

export async function markNotificationReadAction(id: string, expectedUserId: string): Promise<NotificationReadResult> {
	if (!isNotificationId(id) || typeof expectedUserId !== "string" || !expectedUserId) return { ok: false, error: "알림 정보가 올바르지 않습니다." };
	try {
		const { supabase, userId } = await getNotificationContext(expectedUserId);
		const { data: item, error: itemError } = await supabase.from("notifications")
			.select("id, read_at").eq("user_id", userId).eq("id", id).maybeSingle();
		if (itemError) return { ok: false, error: "알림을 확인하지 못했습니다. 다시 시도해 주세요." };
		if (!item) return { ok: false, error: "알림을 찾을 수 없습니다." };
		const readAt = item.read_at ?? new Date().toISOString();
		if (!item.read_at) {
			const { error } = await createServiceClient().from("notifications").update({ read_at: readAt })
				.eq("user_id", userId).eq("id", id).is("read_at", null);
			if (error) return { ok: false, error: "알림 읽음 상태를 저장하지 못했습니다. 다시 시도해 주세요." };
		}
		return { ok: true, userId, readAt, unreadCount: await countUnreadNotifications(supabase, userId) };
	} catch (error) {
		return { ok: false, error: error instanceof NotificationRequestError ? error.message : "알림 읽음 상태를 저장하지 못했습니다." };
	}
}

export async function markAllNotificationsReadAction(cutoff: string, expectedUserId: string): Promise<NotificationReadResult> {
	if (!isNotificationTimestamp(cutoff) || Date.parse(cutoff) > Date.now() + 1_000
		|| typeof expectedUserId !== "string" || !expectedUserId) return { ok: false, error: "알림 확인 시각이 올바르지 않습니다. 다시 열어 주세요." };
	try {
		const { supabase, userId } = await getNotificationContext(expectedUserId);
		const readAt = new Date().toISOString();
		const { error } = await createServiceClient().from("notifications").update({ read_at: readAt })
			.eq("user_id", userId).is("read_at", null).lte("created_at", cutoff);
		if (error) return { ok: false, error: "모두 읽음 상태를 저장하지 못했습니다. 다시 시도해 주세요." };
		return { ok: true, userId, readAt, unreadCount: await countUnreadNotifications(supabase, userId) };
	} catch (error) {
		return { ok: false, error: error instanceof NotificationRequestError ? error.message : "모두 읽음 상태를 저장하지 못했습니다." };
	}
}

export async function deleteNotificationAction(id: string, expectedUserId: string): Promise<NotificationDeleteResult> {
	if (!isNotificationId(id) || typeof expectedUserId !== "string" || !expectedUserId) return { ok: false, error: "알림 정보가 올바르지 않습니다." };
	try {
		const { supabase, userId } = await getNotificationContext(expectedUserId);
		// Scope the privileged write to the authenticated account. Missing rows are
		// successful so a retry never reveals whether another account owns the ID.
		const { error } = await createServiceClient().from("notifications").delete()
			.eq("id", id).eq("user_id", userId);
		if (error) return { ok: false, error: "알림을 삭제하지 못했습니다. 다시 시도해 주세요." };
		return { ok: true, userId, unreadCount: await countUnreadNotifications(supabase, userId) };
	} catch (error) {
		return { ok: false, error: error instanceof NotificationRequestError ? error.message : "알림을 삭제하지 못했습니다. 다시 시도해 주세요." };
	}
}

export async function deleteAllNotificationsAction(cutoff: string, expectedUserId: string): Promise<NotificationDeleteResult> {
	if (!isNotificationTimestamp(cutoff) || Date.parse(cutoff) > Date.now() + 1_000
		|| typeof expectedUserId !== "string" || !expectedUserId) return { ok: false, error: "알림 삭제 시각이 올바르지 않습니다. 다시 열어 주세요." };
	try {
		const { supabase, userId } = await getNotificationContext(expectedUserId);
		// Delete the account's complete snapshot, including read and unloaded rows.
		// Notifications created after the displayed cutoff remain in the inbox.
		const { error } = await createServiceClient().from("notifications").delete()
			.eq("user_id", userId).lte("created_at", cutoff);
		if (error) return { ok: false, error: "알림을 모두 삭제하지 못했습니다. 다시 시도해 주세요." };
		return { ok: true, userId, unreadCount: await countUnreadNotifications(supabase, userId) };
	} catch (error) {
		return { ok: false, error: error instanceof NotificationRequestError ? error.message : "알림을 모두 삭제하지 못했습니다. 다시 시도해 주세요." };
	}
}
