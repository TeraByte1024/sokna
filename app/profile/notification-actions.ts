"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function enableMarketingOptInAction() {
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) return { ok: false as const, error: "로그인이 필요합니다." };

	const { error } = await supabase.from("users")
		.update({ marketing_opt_in: true })
		.eq("id", user.id);
	if (error) return { ok: false as const, error: error.message };

	revalidatePath("/profile");
	revalidatePath("/", "layout");
	return { ok: true as const };
}

export async function registerPushTokenAction(token: string, deviceName: string) {
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) return { ok: false as const, error: "로그인이 필요합니다." };
	if (!token.trim()) return { ok: false as const, error: "유효하지 않은 푸시 토큰입니다." };

	const { data: account, error: accountError } = await supabase.from("users")
		.select("marketing_opt_in").eq("id", user.id).single();
	if (accountError || !account?.marketing_opt_in) {
		return { ok: false as const, error: "먼저 마케팅 알림 수신에 동의하고 프로필을 저장해 주세요." };
	}

	const { error } = await supabase.from("profiles").upsert({
		user_id: user.id,
		fcm_token: token,
		device_name: deviceName.slice(0, 200),
		updated_at: new Date().toISOString(),
	}, { onConflict: "fcm_token" });
	return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function unregisterPushTokenAction(token: string) {
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) return { ok: false as const, error: "로그인이 필요합니다." };
	const { error } = await supabase.from("profiles").delete()
		.eq("user_id", user.id).eq("fcm_token", token);
	return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
