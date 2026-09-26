"use client";

import { createClient } from "@/lib/supabase/client";

/** Keep this browser's push registration, but stop its current account binding before logout. */
export async function signOutWithPushSession() {
	let resume: (() => void) | undefined;
	try {
		const device = await import("@/lib/firebase/push-device");
		resume = device.resumePushDeviceAfterSignOutFailure;
		const result = await device.suspendPushDeviceForSignOut();
		if (!result.ok) console.warn("로그아웃 알림 연결 해제 실패:", result.error);
	} catch (error) {
		// The worker also checks the authenticated session before showing a notification.
		console.warn("로그아웃 알림 연결 확인 실패:", error);
	}

	try {
		const { error } = await createClient().auth.signOut({ scope: "local" });
		if (error) throw error;
	} catch (error) {
		resume?.();
		throw error;
	}
}
