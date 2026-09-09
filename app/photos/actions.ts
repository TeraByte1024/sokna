"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";

export type PhotoActionResult = { ok: true } | { ok: false; error: string };

export async function addPhotoAction(
  url: string,
  title: string,
  caption: string
): Promise<PhotoActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근 가능합니다." };
    }

    const trimmedUrl = url.trim();
    const trimmedTitle = title.trim();

    if (!trimmedUrl) {
      return { ok: false, error: "이미지 URL은 필수입니다." };
    }
    if (!trimmedTitle) {
      return { ok: false, error: "제목은 필수입니다." };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("photos").insert({
      url: trimmedUrl,
      title: trimmedTitle,
      caption: caption.trim() || null,
    });

    if (error) {
      console.error("사진 추가 실패:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath("/photos");
    return { ok: true };
  } catch (err) {
    console.error("사진 추가 오류:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

export async function updatePhotoAction(
  id: string,
  url: string,
  title: string,
  caption: string
): Promise<PhotoActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근 가능합니다." };
    }

    const trimmedUrl = url.trim();
    const trimmedTitle = title.trim();

    if (!trimmedUrl) {
      return { ok: false, error: "이미지 URL은 필수입니다." };
    }
    if (!trimmedTitle) {
      return { ok: false, error: "제목은 필수입니다." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("photos")
      .update({
        url: trimmedUrl,
        title: trimmedTitle,
        caption: caption.trim() || null,
      })
      .eq("id", id);

    if (error) {
      console.error("사진 수정 실패:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath("/photos");
    return { ok: true };
  } catch (err) {
    console.error("사진 수정 오류:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}

export async function deletePhotoAction(
  id: string
): Promise<PhotoActionResult> {
  try {
    const allowed = await getIsAdmin();
    if (!allowed) {
      return { ok: false, error: "관리자만 접근 가능합니다." };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("photos").delete().eq("id", id);

    if (error) {
      console.error("사진 삭제 실패:", error);
      return { ok: false, error: error.message };
    }

    revalidatePath("/photos");
    return { ok: true };
  } catch (err) {
    console.error("사진 삭제 오류:", err);
    return { ok: false, error: "서버 오류가 발생했습니다." };
  }
}
