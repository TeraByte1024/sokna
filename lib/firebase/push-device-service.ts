import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { atPushDeviceStage, logPushDeviceError, PushDeviceError } from "@/lib/firebase/push-device-diagnostics";
import {
	clearPushDeviceReceipt, getPushSession, getReceiptPushProfile, hasPushDeviceReceiptProfile, issuePushDeviceReceipt,
	type VerifiedPushProfile,
} from "@/lib/firebase/push-device-binding";

const DEVICE_ERROR = "이 기기의 알림 등록을 확인하지 못했습니다. 다시 시도해 주세요.";
type PushSession = Awaited<ReturnType<typeof getPushSession>>;

/** Existing own registrations may adopt the signed receipt without being recreated. */
async function verifiedProfile(token: string, context: PushSession): Promise<VerifiedPushProfile | null> {
	const received = await getReceiptPushProfile(token);
	if (received) return received;
	if (!context.user) return null;
	const userId = context.user.id;
	const { data, error } = await atPushDeviceStage("own-profile-read", () => context.supabase.from("profiles")
		.select("id, fcm_token, user_id").eq("user_id", userId).eq("fcm_token", token).maybeSingle());
	if (error) throw new PushDeviceError("own-profile-read", error);
	if (data) await issuePushDeviceReceipt(data);
	return data;
}

async function bindPushProfile(profile: VerifiedPushProfile, userId: string | null): Promise<boolean> {
	if (profile.user_id === userId) return true;
	const { data, error } = await atPushDeviceStage("profile-bind", () => {
		let query = createServiceClient().from("profiles").update({ user_id: userId, updated_at: new Date().toISOString() })
			.eq("id", profile.id).eq("fcm_token", profile.fcm_token);
		query = profile.user_id === null ? query.is("user_id", null) : query.eq("user_id", profile.user_id);
		return query.select("id").maybeSingle();
	});
	if (error) throw new PushDeviceError("profile-bind", error);
	return Boolean(data);
}

/** All single-device removals compare the exact token; user operations also compare its owner. */
async function removeMatchingProfile(profile: Pick<VerifiedPushProfile, "id" | "fcm_token">, owner?: string) {
	const { data, error } = await atPushDeviceStage("profile-delete", () => {
		let query = createServiceClient().from("profiles").delete().eq("id", profile.id).eq("fcm_token", profile.fcm_token);
		if (owner !== undefined) query = query.eq("user_id", owner);
		return query.select("id");
	});
	if (error) throw new PushDeviceError("profile-delete", error);
	return Boolean(data?.length);
}

async function readProfile(field: "id" | "fcm_token", value: string) {
	const { data, error } = await atPushDeviceStage("own-profile-read", () => createServiceClient().from("profiles")
		.select("id, fcm_token, user_id").eq(field, value).maybeSingle());
	if (error) throw new PushDeviceError("own-profile-read", error);
	return data;
}

/** A late FCM rejection must preserve a concurrently replaced token and allow its retry. */
export async function removeInvalidPushDevice(profileId: string, token: string) {
	if (await removeMatchingProfile({ id: profileId, fcm_token: token })) return { replaced: false };
	const current = await readProfile("id", profileId);
	return { replaced: Boolean(current?.fcm_token && current.fcm_token !== token) };
}

/** Synchronization also binds the verified device to the current account, including logout. */
export async function synchronizePushDevice(token: string | null) {
	try {
		const context = await getPushSession();
		const userId = context.user?.id ?? null;
		let marketingOptIn = false;
		if (userId) {
			const { data: account, error } = await atPushDeviceStage("consent-read", () => context.supabase.from("users")
				.select("marketing_opt_in").eq("id", userId).maybeSingle());
			if (error || !account) logPushDeviceError("status", error, "consent-read");
			if (error || !account) return { ok: false as const, error: "알림 수신 설정을 확인하지 못했습니다." };
			marketingOptIn = Boolean(account.marketing_opt_in);
		}
		const profile = token ? await verifiedProfile(token, context) : await getReceiptPushProfile();
		const registered = profile ? await bindPushProfile(profile, userId) : false;
		return { ok: true as const, userId, marketingOptIn, registered: Boolean(token && registered) };
	} catch (error) {
		logPushDeviceError("status", error);
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

export async function registerPushDevice(token: string, deviceName: string, expectedUserId: string) {
	try {
		const context = await getPushSession();
		const { supabase, user } = context;
		if (!user) return { ok: false as const, error: "로그인이 필요합니다." };
		if (user.id !== expectedUserId) return { ok: false as const, error: "로그인 계정이 변경되었습니다. 다시 설정해 주세요." };
		if (!token.trim()) return { ok: false as const, error: "유효하지 않은 푸시 토큰입니다." };
		const { data: account, error: accountError } = await atPushDeviceStage("consent-read", () => supabase.from("users")
			.select("marketing_opt_in").eq("id", user.id).maybeSingle());
		if (accountError) logPushDeviceError("register", accountError, "consent-read");
		if (accountError || !account?.marketing_opt_in) return { ok: false as const, error: "먼저 알림 수신에 동의해 주세요." };
		const existing = await verifiedProfile(token, context);
		if (existing) {
			if (!await bindPushProfile(existing, user.id)) throw new PushDeviceError("profile-bind");
			await issuePushDeviceReceipt(existing);
			return { ok: true as const };
		}
		const { data, error } = await atPushDeviceStage("profile-insert", () => supabase.from("profiles").insert({
			user_id: user.id, fcm_token: token, device_name: deviceName.slice(0, 200), updated_at: new Date().toISOString(),
		}).select("id, fcm_token, user_id").single());
		if (error || !data) throw new PushDeviceError("profile-insert", error);
		await issuePushDeviceReceipt(data);
		return { ok: true as const };
	} catch (error) {
		logPushDeviceError("register", error);
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

/** UPDATE-only preserves opted-out registrations and cannot recreate a removed device. */
export async function refreshPushDeviceToken(previousToken: string, token: string, deviceName: string, expectedUserId: string) {
	try {
		const context = await getPushSession();
		if (!context.user || context.user.id !== expectedUserId) return { ok: false as const, error: "로그인 계정이 변경되었습니다." };
		if (!previousToken.trim() || !token.trim()) return { ok: false as const, error: "유효하지 않은 푸시 토큰입니다." };
		const profile = await verifiedProfile(previousToken, context);
		if (!profile) return { ok: false as const, error: "이 기기의 알림 등록이 없습니다. 다시 켜 주세요." };
		const userId = context.user.id;
		const { data, error } = await atPushDeviceStage("profile-refresh", () => {
			let query = createServiceClient().from("profiles").update({
				user_id: userId, fcm_token: token, device_name: deviceName.slice(0, 200), updated_at: new Date().toISOString(),
			}).eq("id", profile.id).eq("fcm_token", previousToken);
			query = profile.user_id === null ? query.is("user_id", null) : query.eq("user_id", profile.user_id);
			return query.select("id, fcm_token, user_id").maybeSingle();
		});
		if (error || !data) throw new PushDeviceError("profile-refresh", error);
		await issuePushDeviceReceipt(data);
		return { ok: true as const };
	} catch (error) {
		logPushDeviceError("refresh", error);
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

export async function detachPushDevice(token: string | null) {
	try {
		const context = await getPushSession();
		const profile = token ? await verifiedProfile(token, context) : await getReceiptPushProfile();
		if (profile && !await bindPushProfile(profile, null)) throw new PushDeviceError("profile-bind");
		return { ok: true as const };
	} catch (error) {
		logPushDeviceError("detach", error);
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

/** Missing rows are successful cleanup; live foreign or replaced registrations are never removed. */
export async function unregisterPushDevice(token: string) {
	try {
		const context = await getPushSession();
		if (!context.user) return { ok: false as const, error: "로그인이 필요합니다." };
		if (!token.trim()) return { ok: false as const, error: "유효하지 않은 푸시 토큰입니다." };
		const profile = await verifiedProfile(token, context);
		if (profile) {
			if (profile.user_id !== context.user.id) return { ok: false as const, error: DEVICE_ERROR };
			const removed = await removeMatchingProfile(profile, context.user.id);
			if (!removed && (await readProfile("id", profile.id) || await readProfile("fcm_token", token))) {
				return { ok: false as const, error: DEVICE_ERROR };
			}
		} else {
			// An old token may have been rotated, or belong to another account. Only
			// confirmed absence, including the signed receipt's live row, is idempotent.
			if (await hasPushDeviceReceiptProfile() || await readProfile("fcm_token", token)) {
				return { ok: false as const, error: DEVICE_ERROR };
			}
		}
		await clearPushDeviceReceipt();
		return { ok: true as const };
	} catch (error) {
		logPushDeviceError("unregister", error);
		return { ok: false as const, error: DEVICE_ERROR };
	}
}
