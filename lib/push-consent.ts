import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** The database owns consent timestamps and transactional device revocation. */
export function pushConsentFields(consented: boolean) {
	if (typeof consented !== "boolean") throw new Error("알림 수신 동의 여부를 확인해 주세요.");
	return { marketing_opt_in: consented };
}

type ProfileChanges = {
	name: string;
	generation: number;
	part: string | null;
};

type ConsentSaveOptions = {
	profile?: ProfileChanges;
	application?: ProfileChanges & { email: string | null; applied_at: string };
};

/** Save the member's explicit choice with any profile/application fields in one statement. */
export async function savePushConsent(
	supabase: SupabaseClient<Database>,
	userId: string,
	consented: boolean,
	options: ConsentSaveOptions = {},
) {
	const consent = pushConsentFields(consented);
	const query = options.application
		? supabase.from("users").upsert({
			...options.application, id: userId, status: "pending", ...consent,
		})
		: supabase.from("users").update({ ...options.profile, ...consent }).eq("id", userId);
	// RLS-hidden or missing rows must not look like a successful consent save.
	return query.select("id").single();
}
