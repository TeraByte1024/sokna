"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getIsAdmin } from "@/lib/auth-admin";
import type { SetlistFormValues } from "@/lib/setlist";

export async function addSetlist(gigId: string, payload: SetlistFormValues) {
	const supabase = await createClient();

	// 1. 현재 접속한 유저 정보 가져오기 (보안 검사)
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw new Error("인증된 사용자가 아닙니다.");

	// 2. 해당 공연(gig_id)에 대한 유저의 Performer 권한(int8 ID) 조회
	const { data: performer, error: performerError } = await supabase
		.from("performers")
		.select("id")
		.eq("gig_id", Number(gigId))
		.eq("user_id", user.id)
		.single();

	if (performerError || !performer) {
		throw new Error("이 공연의 참여자로 등록되지 않았습니다.");
	}

	// 3. 실제 DB 컬럼명과 매칭하여 Insert
	// 이미지의 컬럼명: id(identity), title, artist, required_parts, sheet_exists, description, links, gig_id, created_by
	const { error } = await supabase.from("setlists").insert({
		gig_id: Number(gigId), // int8
		title: payload.title, // text
		artist: payload.artist, // text
		required_parts: payload.requiredParts, // _text (JS 배열 ['보컬', '기타'] 전달)
		sheet_exists: payload.sheetExists, // bool
		description: payload.description, // text
		links: (payload.links ?? []) as unknown as import("@/lib/supabase/database.types").Json, // jsonb
		created_by: performer.id, // int8 (Foreign Key)
	});

	if (error) {
		console.error("Setlist insert error:", error);
		throw new Error("곡 등록 중 오류가 발생했습니다.");
	}

	// 데이터 캐시 갱신
	revalidatePath(`/gigs/${gigId}/setlists`);
}

/**
 * 곡 삭제 액션
 * - 공연 정보에 확정된 곡(order_num > 0): 오직 관리자만 삭제 가능 (곡 등록자 권한 없음)
 * - 선곡회의 후보곡(order_num = 0 또는 null): 관리자 또는 해당 곡 등록자만 삭제 가능
 */
export async function deleteSetlist(gigId: string, id: number) {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) throw new Error("인증된 사용자가 아닙니다.");

	const isAdmin = await getIsAdmin();

	// 대상 곡 정보 확인
	const { data: song, error: fetchErr } = await supabase
		.from("setlists")
		.select("id, order_num, created_by")
		.eq("id", id)
		.single();

	if (fetchErr || !song) {
		throw new Error("곡 정보를 찾을 수 없습니다.");
	}

	// 1. 공연 정보에 확정된 곡(order_num > 0)인 경우: 관리자만 삭제 가능
	if ((song.order_num ?? 0) > 0) {
		if (!isAdmin) {
			throw new Error("공연 정보에 등록된 셋리스트는 관리자만 삭제할 수 있습니다.");
		}
	} else {
		// 2. 선곡회의 후보곡(order_num = 0)인 경우: 관리자 또는 본인 등록 곡만 삭제 가능
		if (!isAdmin) {
			const { data: performer } = await supabase
				.from("performers")
				.select("id")
				.eq("id", song.created_by ?? 0)
				.eq("user_id", user.id)
				.maybeSingle();

			if (!performer) {
				throw new Error("본인이 등록한 곡만 삭제할 수 있습니다.");
			}
		}
	}

	const { error } = await supabase.from("setlists").delete().eq("id", id);
	if (error) {
		console.error("Setlist delete error:", error);
		throw new Error("곡 삭제 중 오류가 발생했습니다: " + error.message);
	}

	revalidatePath(`/gigs/${gigId}/setlists`);
	revalidatePath(`/gigs/${gigId}`);
}

