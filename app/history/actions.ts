"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";

export type HistoryActionResult = { ok: true } | { ok: false; error: string };

export async function addMemberAction(
  name: string,
  generation: number,
  part: string
): Promise<HistoryActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근 가능합니다." };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: "이름은 필수 항목입니다." };
    }

    if (generation < 1) {
      return { ok: false, error: "기수는 1 이상이어야 합니다." };
    }

    const supabase = await createClient();
    
    // UUID 생성 후 삽입
    const id = crypto.randomUUID();
    const { error } = await supabase.from("users").insert({
      id,
      name: trimmedName,
      generation,
      part: part.trim() || null,
    });

    if (error) {
      console.error("부원 추가 실패:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath("/history");
    return { ok: true };
  } catch (err) {
    console.error("부원 추가 오류:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

export async function updateMemberAction(
  id: string,
  name: string,
  generation: number,
  part: string
): Promise<HistoryActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근 가능합니다." };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { ok: false, error: "이름은 필수 항목입니다." };
    }

    if (generation < 1) {
      return { ok: false, error: "기수는 1 이상이어야 합니다." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({
        name: trimmedName,
        generation,
        part: part.trim() || null,
      })
      .eq("id", id);

    if (error) {
      console.error("부원 수정 실패:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath("/history");
    return { ok: true };
  } catch (err) {
    console.error("부원 수정 오류:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

export async function deleteMemberAction(
  id: string
): Promise<HistoryActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근 가능합니다." };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) {
      console.error("부원 삭제 실패:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath("/history");
    return { ok: true };
  } catch (err) {
    console.error("부원 삭제 오류:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}
