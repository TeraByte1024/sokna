"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getIsAdmin } from "@/lib/auth-admin";
import type { NominationFormValues } from "@/lib/nomination";
import {
	enqueueSongNotification,
	processNotificationQueue,
	recordLastViewedNomination,
} from "@/lib/nomination-notifications";

/**
 * 선곡회의 후보곡 등록 액션
 * - nominations 테이블에 저장
 * - 새 곡 알림 큐를 생성하고 요청 안에서 즉시 발송
 */
export async function addNomination(gigId: string, payload: NominationFormValues) {
	const supabase = await createClient();

	// 1. 현재 접속한 유저 정보 가져오기 (보안 검사)
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw new Error("인증된 사용자가 아닙니다.");

	// 2. 해당 공연(gig_id)에 대한 유저의 Performer 권한 조회 또는 관리자 권한 확인
	const numericGigId = Number(gigId);
	let activePerformerId: number | null = null;
	const { data: performer } = await supabase
		.from("performers")
		.select("id")
		.eq("gig_id", numericGigId)
		.eq("user_id", user.id)
		.maybeSingle();

	if (performer) {
		activePerformerId = performer.id;
	} else {
		// user_id가 미연동된 performer인 경우 유저 프로필 이름으로 fallback 매칭
		const { data: userProfile } = await supabase
			.from("users")
			.select("name")
			.eq("id", user.id)
			.maybeSingle();

		const profileName = userProfile?.name || user.user_metadata?.name;
		if (profileName) {
			const { data: namePerformer } = await supabase
				.from("performers")
				.select("id")
				.eq("gig_id", numericGigId)
				.eq("name", profileName)
				.maybeSingle();

			if (namePerformer) {
				activePerformerId = namePerformer.id;
			}
		}
	}

	const isAdmin = await getIsAdmin();
	if (!isAdmin && !activePerformerId) {
		throw new Error("이 공연의 참여자로 등록되지 않았습니다.");
	}

	// 3. nominations 테이블에 Insert
	const { data: inserted, error } = await supabase
		.from("nominations")
		.insert({
			gig_id: numericGigId,
			title: payload.title,
			artist: payload.artist || null,
			required_parts: payload.requiredParts,
			sheet_exists: payload.sheetExists,
			sheet_note: payload.sheetNote || "",
			description: payload.description || "",
			links: (payload.links ?? []) as unknown as import("@/lib/supabase/database.types").Json,
			recommended_vocals: (payload.recommendedVocals ?? []) as unknown as import("@/lib/supabase/database.types").Json,
			created_by: activePerformerId,
		})
		.select("id")
		.single();

	if (error || !inserted) {
		console.error("Nomination insert error:", error);
		throw new Error("후보곡 등록 중 오류가 발생했습니다: " + (error?.message || ""));
	}

	// 4. 알림 큐를 생성하고 현재 요청 안에서 즉시 처리
	try {
		const queueId = await enqueueSongNotification(numericGigId, inserted.id, user.id);
		if (queueId !== null) {
			const result = await processNotificationQueue([queueId]);
			if (result.processedCount === 0) {
				console.warn("후보곡 알림 큐가 즉시 처리되지 않았습니다:", queueId);
			}
		}
	} catch (queueErr) {
		console.warn("알림 큐 등록 실패 건너뜀:", queueErr);
	}

	// 데이터 캐시 갱신
	revalidatePath(`/gigs/${gigId}/nominations`);
	revalidatePath(`/gigs/${gigId}`);
}

export const addSetlist = addNomination;

/**
 * 선곡회의 후보곡 삭제 액션
 * - nominations 테이블 대상
 * - 관리자 또는 본인 등록 곡만 삭제 가능
 */
export async function deleteNomination(gigId: string, id: number) {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("인증된 사용자가 아닙니다.");

	const isAdmin = await getIsAdmin();

	// 대상 곡 정보 확인
	const { data: song, error: fetchErr } = await supabase
		.from("nominations")
		.select("id, created_by")
		.eq("id", id)
		.single();

	if (fetchErr || !song) {
		throw new Error("곡 정보를 찾을 수 없습니다.");
	}

	// 본인 등록 여부 검증 (관리자가 아닌 경우)
	if (!isAdmin) {
		let isOwner = false;
		if (song.created_by) {
			const { data: performer } = await supabase
				.from("performers")
				.select("id, name, user_id")
				.eq("id", song.created_by)
				.maybeSingle();

			if (performer) {
				if (performer.user_id === user.id) {
					isOwner = true;
				} else {
					const { data: userProfile } = await supabase
						.from("users")
						.select("name")
						.eq("id", user.id)
						.maybeSingle();
					const profileName = userProfile?.name || user.user_metadata?.name;
					if (profileName && performer.name === profileName) {
						isOwner = true;
					}
				}
			}
		}

		if (!isOwner) {
			throw new Error("본인이 등록한 곡만 삭제할 수 있습니다.");
		}
	}

	const { error } = await supabase.from("nominations").delete().eq("id", id);
	if (error) {
		console.error("Nomination delete error:", error);
		throw new Error("곡 삭제 중 오류가 발생했습니다: " + error.message);
	}

	revalidatePath(`/gigs/${gigId}/nominations`);
	revalidatePath(`/gigs/${gigId}`);
}

export const deleteSetlist = deleteNomination;

/**
 * 선곡회의 후보곡 수정 액션
 * - nominations 테이블 대상
 * - 관리자 또는 본인 등록 곡만 수정 가능
 */
export async function updateNomination(
	gigId: string,
	id: number,
	payload: NominationFormValues,
) {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("인증된 사용자가 아닙니다.");

	const isAdmin = await getIsAdmin();

	// 대상 곡 정보 확인
	const { data: song, error: fetchErr } = await supabase
		.from("nominations")
		.select("id, created_by")
		.eq("id", id)
		.single();

	if (fetchErr || !song) {
		throw new Error("곡 정보를 찾을 수 없습니다.");
	}

	// 본인 등록 여부 검증 (관리자가 아닌 경우)
	if (!isAdmin) {
		let isOwner = false;
		if (song.created_by) {
			const { data: performer } = await supabase
				.from("performers")
				.select("id, name, user_id")
				.eq("id", song.created_by)
				.maybeSingle();

			if (performer) {
				if (performer.user_id === user.id) {
					isOwner = true;
				} else {
					const { data: userProfile } = await supabase
						.from("users")
						.select("name")
						.eq("id", user.id)
						.maybeSingle();
					const profileName = userProfile?.name || user.user_metadata?.name;
					if (profileName && performer.name === profileName) {
						isOwner = true;
					}
				}
			}
		}

		if (!isOwner) {
			throw new Error("본인이 등록한 곡만 수정할 수 있습니다.");
		}
	}

	const { error } = await supabase
		.from("nominations")
		.update({
			title: payload.title,
			artist: payload.artist || null,
			required_parts: payload.requiredParts,
			sheet_exists: payload.sheetExists,
			sheet_note: payload.sheetNote || "",
			description: payload.description || "",
			links: (payload.links ?? []) as unknown as import("@/lib/supabase/database.types").Json,
			recommended_vocals: (payload.recommendedVocals ?? []) as unknown as import("@/lib/supabase/database.types").Json,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id);

	if (error) {
		console.error("Nomination update error:", error);
		throw new Error("곡 수정 중 오류가 발생했습니다: " + error.message);
	}

	revalidatePath(`/gigs/${gigId}/nominations`);
	revalidatePath(`/gigs/${gigId}`);
}

export const updateSetlist = updateNomination;

/**
 * 사용자가 선곡 회의 페이지를 확인한 시각 갱신 액션
 */
export async function updateNominationViewAction(gigId: string) {
	try {
		const supabase = await createClient();
		const {
			data: { user },
		} = await supabase.auth.getUser();

		if (!user) return { ok: false, error: "Unauthorized" };

		const numericGigId = Number(gigId);
		const result = await recordLastViewedNomination(numericGigId, user.id);
		return result;
	} catch (err) {
		console.error("updateNominationViewAction error:", err);
		return { ok: false, error: "Failed to update view timestamp" };
	}
}

export const updateSetlistViewAction = updateNominationViewAction;

export interface SessionResponseInput {
	sessionPart: string;
	status: import("@/lib/nomination").NominationResponseStatus;
	comment?: string;
}

/**
 * 후보곡 세션별 참여 가능 여부 및 코멘트 일괄 저장 액션
 * - 복합 유니크 키 (nomination_id, user_id, session_part) 기반 upsert
 */
export async function saveNominationResponsesAction(
	nominationId: number,
	gigId: string,
	responses: SessionResponseInput[],
) {
	try {
		const supabase = await createClient();
		const {
			data: { user },
			error: authError,
		} = await supabase.auth.getUser();

		if (authError || !user) throw new Error("인증된 사용자가 아닙니다.");

		// 해당 공연 참여자 또는 관리자 확인
		const numericGigId = Number(gigId);
		const { data: performer } = await supabase
			.from("performers")
			.select("id")
			.eq("gig_id", numericGigId)
			.eq("user_id", user.id)
			.maybeSingle();

		const isAdmin = await getIsAdmin();
		if (!isAdmin && !performer) {
			throw new Error("이 공연의 참여자만 세션 응답을 남길 수 있습니다.");
		}

		if (responses.length === 0) {
			return { ok: true };
		}

		// upsert 대상 레코드 생성
		const rowsToUpsert = responses.map((r) => ({
			nomination_id: nominationId,
			user_id: user.id,
			session_part: r.sessionPart,
			status: r.status,
			comment: r.comment?.trim() || "",
			updated_at: new Date().toISOString(),
		}));

		const { error: upsertError } = await supabase
			.from("nomination_responses")
			.upsert(rowsToUpsert, {
				onConflict: "nomination_id,user_id,session_part",
			});

		if (upsertError) {
			console.error("saveNominationResponsesAction upsert error:", upsertError);
			throw new Error("세션 응답 저장 중 오류가 발생했습니다: " + upsertError.message);
		}

		revalidatePath(`/gigs/${gigId}/nominations`);
		return { ok: true };
	} catch (err: unknown) {
		console.error("saveNominationResponsesAction catch error:", err);
		return {
			ok: false,
			error: err instanceof Error ? err.message : "응답 저장에 실패했습니다.",
		};
	}
}

/**
 * 단일 세션 응답 저장 액션
 */
export async function saveNominationResponseAction(
	nominationId: number,
	gigId: string,
	sessionPart: string,
	status: import("@/lib/nomination").NominationResponseStatus,
	comment?: string,
) {
	return saveNominationResponsesAction(nominationId, gigId, [
		{ sessionPart, status, comment },
	]);
}
