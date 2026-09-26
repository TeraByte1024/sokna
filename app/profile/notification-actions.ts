"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
	bindPushProfile,
	clearPushDeviceReceipt,
	getPushSession,
	getReceiptPushProfile,
	issuePushDeviceReceipt,
	type VerifiedPushProfile,
} from "@/lib/firebase/push-device-binding";

const DEVICE_ERROR = "이 기기의 알림 등록을 확인하지 못했습니다. 다시 시도해 주세요.";

/** Existing own registrations may adopt the receipt protocol without requiring re-registration. */
async function verifiedProfile(
	token: string,
	context: Awaited<ReturnType<typeof getPushSession>>,
): Promise<VerifiedPushProfile | null> {
	const received = await getReceiptPushProfile(token);
	if (received) return received;
	if (!context.user) return null;
	const { data, error } = await context.supabase.from("profiles").select("id, fcm_token, user_id")
		.eq("user_id", context.user.id).eq("fcm_token", token).maybeSingle();
	if (error) throw new Error(DEVICE_ERROR);
	if (data) await issuePushDeviceReceipt(data);
	return data;
}

export async function enableMarketingOptInAction() {
	try {
		const { supabase, user } = await getPushSession();
		if (!user) return { ok: false as const, error: "로그인이 필요합니다." };
		const { error } = await supabase.from("users").update({ marketing_opt_in: true }).eq("id", user.id);
		if (error) return { ok: false as const, error: "알림 수신 동의를 저장하지 못했습니다." };
		revalidatePath("/profile");
		revalidatePath("/", "layout");
		return { ok: true as const };
	} catch {
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

/** Preserve the registration and bind this browser's verified device to its current session. */
export async function getPushDeviceStatusAction(token: string | null) {
	try {
		const context = await getPushSession();
		const userId = context.user?.id ?? null;
		let marketingOptIn = false;
		if (userId) {
			const { data: account, error } = await context.supabase.from("users")
				.select("marketing_opt_in").eq("id", userId).maybeSingle();
			if (error || !account) return { ok: false as const, error: "알림 수신 설정을 확인하지 못했습니다." };
			marketingOptIn = Boolean(account.marketing_opt_in);
		}
		const profile = token ? await verifiedProfile(token, context) : await getReceiptPushProfile();
		const registered = profile ? await bindPushProfile(profile, userId) : false;
		return { ok: true as const, userId, marketingOptIn, registered: Boolean(token && registered) };
	} catch {
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

export async function registerPushTokenAction(token: string, deviceName: string, expectedUserId: string) {
	try {
		const context = await getPushSession();
		const { supabase, user } = context;
		if (!user) return { ok: false as const, error: "로그인이 필요합니다." };
		if (user.id !== expectedUserId) return { ok: false as const, error: "로그인 계정이 변경되었습니다. 다시 설정해 주세요." };
		if (!token.trim()) return { ok: false as const, error: "유효하지 않은 푸시 토큰입니다." };
		const { data: account, error: accountError } = await supabase.from("users")
			.select("marketing_opt_in").eq("id", user.id).maybeSingle();
		if (accountError || !account?.marketing_opt_in) return { ok: false as const, error: "먼저 알림 수신에 동의해 주세요." };
		const existing = await verifiedProfile(token, context);
		if (existing) {
			if (!await bindPushProfile(existing, user.id)) return { ok: false as const, error: DEVICE_ERROR };
			await issuePushDeviceReceipt(existing);
			return { ok: true as const };
		}
		// INSERT deliberately cannot take another account's or an unbound token without a receipt.
		const { data, error } = await supabase.from("profiles").insert({
			user_id: user.id, fcm_token: token, device_name: deviceName.slice(0, 200), updated_at: new Date().toISOString(),
		}).select("id, fcm_token, user_id").single();
		if (error || !data) return { ok: false as const, error: DEVICE_ERROR };
		await issuePushDeviceReceipt(data);
		return { ok: true as const };
	} catch {
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

/** An existing device remains registered even while its current account has opted out. */
export async function refreshPushTokenAction(previousToken: string, token: string, deviceName: string, expectedUserId: string) {
	try {
		const context = await getPushSession();
		if (!context.user || context.user.id !== expectedUserId) return { ok: false as const, error: "로그인 계정이 변경되었습니다." };
		if (!previousToken.trim() || !token.trim()) return { ok: false as const, error: "유효하지 않은 푸시 토큰입니다." };
		const profile = await verifiedProfile(previousToken, context);
		if (!profile) return { ok: false as const, error: "이 기기의 알림 등록이 없습니다. 다시 켜 주세요." };
		let query = createServiceClient().from("profiles").update({
			user_id: context.user.id, fcm_token: token, device_name: deviceName.slice(0, 200), updated_at: new Date().toISOString(),
		}).eq("id", profile.id).eq("fcm_token", previousToken);
		query = profile.user_id === null ? query.is("user_id", null) : query.eq("user_id", profile.user_id);
		const { data, error } = await query.select("id, fcm_token, user_id").maybeSingle();
		if (error || !data) return { ok: false as const, error: DEVICE_ERROR };
		await issuePushDeviceReceipt(data);
		return { ok: true as const };
	} catch {
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

/** Logout only unbinds this verified device. Its token and receipt remain available for the next login. */
export async function detachPushDeviceAction(token: string | null) {
	try {
		const context = await getPushSession();
		const profile = token ? await verifiedProfile(token, context) : await getReceiptPushProfile();
		if (!profile) return { ok: true as const };
		return await bindPushProfile(profile, null)
			? { ok: true as const } : { ok: false as const, error: DEVICE_ERROR };
	} catch {
		return { ok: false as const, error: DEVICE_ERROR };
	}
}

/** Explicitly switching the device toggle off still removes this registration. */
export async function unregisterPushTokenAction(token: string) {
	try {
		const context = await getPushSession();
		if (!context.user) return { ok: false as const, error: "로그인이 필요합니다." };
		const profile = await verifiedProfile(token, context);
		if (!profile) return { ok: false as const, error: DEVICE_ERROR };
		const { error } = await createServiceClient().from("profiles").delete()
			.eq("id", profile.id).eq("fcm_token", token);
		if (error) return { ok: false as const, error: DEVICE_ERROR };
		await clearPushDeviceReceipt();
		return { ok: true as const };
	} catch {
		return { ok: false as const, error: DEVICE_ERROR };
	}
}
