"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
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
		links: payload.links, // jsonb
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
 */
export async function deleteSetlist(gigId: string, id: number) {
	const supabase = await createClient();

	// RLS 정책이 잘 설정되어 있다면,
	// 본인의 created_by(performer.id)가 아닌 경우 DB 레벨에서 삭제가 거부됩니다.
	const { error } = await supabase.from("setlists").delete().eq("id", id);

	if (error) throw error;

	revalidatePath(`/gigs/${gigId}/setlists`);
}
