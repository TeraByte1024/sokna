"use server";

import { revalidatePath } from "next/cache";
import { savePushConsent } from "@/lib/push-consent";
import { atPushDeviceStage, logPushDeviceError } from "@/lib/firebase/push-device-diagnostics";
import { getPushSession } from "@/lib/firebase/push-device-binding";
import {
	synchronizePushDevice, registerPushDevice, refreshPushDeviceToken, detachPushDevice, unregisterPushDevice,
} from "@/lib/firebase/push-device-service";

export async function enableMarketingOptInAction() {
	try {
		const { supabase, user } = await getPushSession();
		if (!user) return { ok: false as const, error: "로그인이 필요합니다." };
		const { error } = await atPushDeviceStage("consent-write", () => savePushConsent(supabase, user.id, true));
		if (error) logPushDeviceError("enable-consent", error, "consent-write");
		if (error) return { ok: false as const, error: "알림 수신 동의를 저장하지 못했습니다." };
		revalidatePath("/profile");
		revalidatePath("/", "layout");
		return { ok: true as const };
	} catch (error) {
		logPushDeviceError("enable-consent", error);
		return { ok: false as const, error: "이 기기의 알림 등록을 확인하지 못했습니다. 다시 시도해 주세요." };
	}
}

/** Synchronization can rebind the verified registration to the current account. */
export async function getPushDeviceStatusAction(token: string | null) {
	return synchronizePushDevice(token);
}

export async function registerPushTokenAction(token: string, deviceName: string, expectedUserId: string) {
	return registerPushDevice(token, deviceName, expectedUserId);
}

export async function refreshPushTokenAction(previousToken: string, token: string, deviceName: string, expectedUserId: string) {
	return refreshPushDeviceToken(previousToken, token, deviceName, expectedUserId);
}

export async function detachPushDeviceAction(token: string | null) {
	return detachPushDevice(token);
}

export async function unregisterPushTokenAction(token: string) {
	return unregisterPushDevice(token);
}
