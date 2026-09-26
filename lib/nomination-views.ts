import { createClient } from "@/lib/supabase/server";

/**
 * 사용자의 선곡회의 마지막 확인 일시를 기록/갱신
 */
export async function recordLastViewedNomination(
	gigId: number,
	userId: string,
): Promise<{ ok: boolean; timestamp: string }> {
	try {
		const supabase = await createClient();
		const now = new Date().toISOString();

		const { error } = await supabase
			.from("setlist_views")
			.upsert({
				user_id: userId,
				gig_id: gigId,
				last_viewed_at: now,
			});

		if (error) {
			console.error("setlist_views upsert 오류:", error);
			return { ok: false, timestamp: now };
		}

		return { ok: true, timestamp: now };
	} catch (err) {
		console.error("recordLastViewedNomination 예외:", err);
		return { ok: false, timestamp: new Date().toISOString() };
	}
}
