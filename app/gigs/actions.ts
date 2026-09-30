"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { getGigViewer } from "@/lib/gig-viewer";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getGigVisibility, isGigVisibility } from "@/lib/gig-visibility";
import { processPendingPushNotifications } from "@/lib/push-notifications";
import { mergeLinkedGigPerformers, planGigPerformerChanges, type IncomingGigPerformer } from "@/lib/gig-performer-reconcile";

export type GigActionResult = { ok: true; gigId?: number } | { ok: false; error: string };

/** 빈 문자열을 null로 변환하는 헬퍼 함수 */
function emptyToNull(s: FormDataEntryValue | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

/** 가격 문자열(정수 또는 콤마 포함)을 파싱하여 정수 또는 null로 변환하는 헬퍼 함수 */
function parsePrice(val: FormDataEntryValue | null): number | null {
  if (val == null) return null;
  const s = String(val).replace(/[^\d]/g, "").trim();
  if (!s) return null;
  const num = parseInt(s, 10);
  return isNaN(num) ? null : num;
}

export async function createGig(formData: FormData): Promise<GigActionResult> {
  const allowed = await getIsAdmin();
  if (!allowed) return { ok: false, error: "관리자만 접근 가능합니다." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "공연 제목은 필수입니다." };

  const subtitle = emptyToNull(formData.get("subtitle"));
  const perform_date = emptyToNull(formData.get("perform_date"));
  if (!perform_date) return { ok: false, error: "공연 일시는 필수입니다." };
  const perform_time = emptyToNull(formData.get("perform_time"));
  const meeting_date = emptyToNull(formData.get("meeting_date"));
  const meeting_time = emptyToNull(formData.get("meeting_time"));
  const location = emptyToNull(formData.get("location"));
  const meeting_location = emptyToNull(formData.get("meeting_location"));
  const poster_url = emptyToNull(formData.get("poster_url"));
  const visibility = formData.get("visibility");
  if (!isGigVisibility(visibility)) return { ok: false, error: "올바른 공연 공개 범위를 선택해 주세요." };
  const is_public = visibility === "public";

  const advance_ticket_price = parsePrice(formData.get("advance_ticket_price"));
  const door_ticket_price = parsePrice(formData.get("door_ticket_price"));

  // 프론트엔드에서 전달된 참여자 JSON 파싱
  const rawPerformers = formData.get("performers") as string;
  let performersList: { id?: string; name: string; email?: string; part?: string; photo_url?: string }[] = [];

  try {
    performersList = rawPerformers ? JSON.parse(rawPerformers) : [];
  } catch (e) {
    console.error("참여자 데이터 파싱 실패:", e);
  }

  const supabase = await createClient();

  // 1. 공연(Gig) 정보 먼저 삽입
  // select()를 붙여야 생성된 gig의 ID를 가져올 수 있습니다.
  const { data: newGig, error: gigError } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .insert({
      title,
      subtitle,
      advance_ticket_price,
      door_ticket_price,
      perform_date,
      perform_time,
      meeting_date,
      meeting_time,
      location,
      meeting_location,
      poster_url,
      is_public,
      visibility,
    })
    .select()
    .single();

  if (gigError) return { ok: false, error: gigError.message };

  // 2. 참여자 매핑 데이터 준비 (N:M 관계, 미연동 더미 공연자도 지원)
  if (performersList.length > 0) {
    const mappingData = mergeLinkedGigPerformers(performersList)
      .filter((p) => Boolean(p.name && p.name.trim()))
      .map((p) => {
        const linked = Boolean(p.id && !p.email?.startsWith("temp-"));
        return {
          gig_id: newGig.id,
          user_id: linked ? p.id! : null,
          name: p.name.trim(),
          part: p.part || "세션",
          photo_url: p.photo_url || null,
        };
      });

    if (mappingData.length > 0) {
      const { error: mappingError } = await supabase
        .from("performers") // 매핑 테이블 이름
        .insert(mappingData);

      if (mappingError) {
        console.error("매핑 저장 실패:", mappingError);
      }
    }
  }

  // 3. SETLIST(곡 목록 및 연주자 명단) 등록
  const rawSetlists = formData.get("setlists") as string | null;
  if (rawSetlists) {
    try {
      const setlistsList: {
        title: string;
        artist?: string;
        session_members?: string;
        order_num?: number;
      }[] = JSON.parse(rawSetlists);

      const setlistsToInsert = setlistsList
        .filter((item) => item.title && item.title.trim().length > 0)
        .map((item, idx) => ({
          gig_id: newGig.id,
          title: item.title.trim(),
          artist: item.artist?.trim() || null,
          session_members: item.session_members?.trim().replaceAll("키보드", "건반") || null,
          order_num: idx + 1,
        }));

      if (setlistsToInsert.length > 0) {
        const { error: setlistError } = await supabase
          .from("setlists")
          .insert(setlistsToInsert);
        if (setlistError) {
          console.error("셋리스트 등록 실패:", setlistError);
        }
      }
    } catch (e) {
      console.error("셋리스트 데이터 파싱 실패:", e);
    }
  }

  revalidatePath("/gigs");
  return { ok: true, gigId: newGig.id };
}

/** 공연 정보 수정 (관리자 전용) */
export async function updateGig(formData: FormData): Promise<GigActionResult> {
  const allowed = await getIsAdmin();
  if (!allowed) return { ok: false, error: "관리자만 접근 가능합니다." };

  const idStr = formData.get("id");
  const gigId = Number(idStr);
  if (!gigId || isNaN(gigId)) return { ok: false, error: "유효하지 않은 공연 ID입니다." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "공연 제목은 필수입니다." };

  const subtitle = emptyToNull(formData.get("subtitle"));
  const perform_date = emptyToNull(formData.get("perform_date"));
  if (!perform_date) return { ok: false, error: "공연 일시는 필수입니다." };
  const perform_time = emptyToNull(formData.get("perform_time"));
  const meeting_date = emptyToNull(formData.get("meeting_date"));
  const meeting_time = emptyToNull(formData.get("meeting_time"));
  const deadlineInput = emptyToNull(formData.get("nomination_deadline"));
  const deadlineTimestamp = deadlineInput ? Date.parse(deadlineInput) : null;
  if (deadlineInput && !Number.isFinite(deadlineTimestamp)) {
    return { ok: false, error: "추천곡 접수 마감 기한을 확인해 주세요." };
  }
  const nomination_deadline = deadlineTimestamp === null ? null : new Date(deadlineTimestamp).toISOString();
  const location = emptyToNull(formData.get("location"));
  const meeting_location = emptyToNull(formData.get("meeting_location"));
  const poster_url = emptyToNull(formData.get("poster_url"));
  const visibility = formData.get("visibility");
  if (!isGigVisibility(visibility)) return { ok: false, error: "올바른 공연 공개 범위를 선택해 주세요." };
  const is_public = visibility === "public";
  const advance_ticket_price = parsePrice(formData.get("advance_ticket_price"));
  const door_ticket_price = parsePrice(formData.get("door_ticket_price"));

  // 프론트엔드에서 전달된 참여자 JSON 파싱
  const rawPerformers = formData.get("performers") as string;
  let performersList: IncomingGigPerformer[] = [];

  try {
    performersList = rawPerformers ? JSON.parse(rawPerformers) : [];
  } catch (e) {
    console.error("참여자 데이터 파싱 실패:", e);
    return { ok: false, error: "공연자 데이터를 읽을 수 없습니다." };
  }

  if (!Array.isArray(performersList) || performersList.some((p) => !p || typeof p.name !== "string")) {
    return { ok: false, error: "공연자 데이터 형식이 올바르지 않습니다." };
  }

  const supabase = await createClient();

  // 공연자 행 ID를 우선 사용해 기존 행을 갱신한다.
  const { data: existingPerformers, error: fetchPerfError } = await supabase
    .from("performers")
    .select("id, user_id, name, part, photo_url")
    .eq("gig_id", gigId);

  if (fetchPerfError || !existingPerformers) {
    return { ok: false, error: `공연자 조회 실패: ${fetchPerfError?.message ?? "알 수 없는 오류"}` };
  }

  const plan = planGigPerformerChanges(gigId, performersList, existingPerformers);
  if (!plan.ok) return { ok: false, error: plan.error };

  // 공연 기본 정보는 공연자 계획 검증 후 갱신한다.
  const { error: gigError } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .update({
      title,
      subtitle,
      advance_ticket_price,
      door_ticket_price,
      perform_date,
      perform_time,
      meeting_date,
      meeting_time,
      nomination_deadline,
      location,
      meeting_location,
      poster_url,
      is_public,
      visibility,
    })
    .eq("id", gigId);

  if (gigError) return { ok: false, error: gigError.message };


  // 같은 회원으로 합쳐진 행의 선곡 기록은 살아남는 행으로 이전한다.
  for (const ep of plan.toDelete) {
    const { error: nominationError } = await supabase
      .from("nominations")
      .update({ created_by: ep.replacementId })
      .eq("created_by", ep.id);
    if (nominationError) {
      return { ok: false, error: `공연자 선곡 기록 이전 실패: ${nominationError.message}` };
    }

    const { error: setlistAuthorError } = await supabase
      .from("setlists")
      .update({ created_by: ep.replacementId })
      .eq("created_by", ep.id);
    if (setlistAuthorError) {
      return { ok: false, error: `공연자 셋리스트 기록 이전 실패: ${setlistAuthorError.message}` };
    }

    const { error: delError } = await supabase
      .from("performers")
      .delete()
      .eq("id", ep.id)
      .eq("gig_id", gigId);
    if (delError) {
      return { ok: false, error: `공연자 삭제 실패: ${delError.message}` };
    }
  }

  for (const item of plan.toUpdate) {
    const { error: updateError } = await supabase
      .from("performers")
      .update({
        user_id: item.user_id,
        name: item.name,
        part: item.part,
        photo_url: item.photo_url,
      })
      .eq("id", item.id)
      .eq("gig_id", gigId);
    if (updateError) {
      return { ok: false, error: `공연자 수정 실패: ${updateError.message}` };
    }
  }

  if (plan.toInsert.length > 0) {
    const { error: insertError } = await supabase.from("performers").insert(plan.toInsert);
    if (insertError) {
      return { ok: false, error: `공연자 추가 실패: ${insertError.message}` };
    }
  }

  // 3. SETLIST(곡 목록 및 연주자 명단) 동기화
  const rawSetlists = formData.get("setlists") as string | null;
  if (rawSetlists !== null) {
    try {
      const setlistsList: {
        id?: number | string;
        title: string;
        artist?: string;
        session_members?: string;
        order_num?: number;
      }[] = JSON.parse(rawSetlists);

      const { data: existingSetlists, error: fetchSetlistError } = await supabase
        .from("setlists")
        .select("id")
        .eq("gig_id", gigId);

      if (fetchSetlistError) {
        console.error("기존 셋리스트 조회 실패:", fetchSetlistError);
        return { ok: false, error: `셋리스트 조회 실패: ${fetchSetlistError.message}` };
      }

      const existingSetlistIds = new Set((existingSetlists ?? []).map((s) => s.id));
      const incomingSetlistIds = new Set(
        setlistsList
          .map((s) => (s.id ? Number(s.id) : null))
          .filter((id): id is number => typeof id === "number" && !isNaN(id))
      );

      // A. 수정 및 추가
      for (let idx = 0; idx < setlistsList.length; idx++) {
        const item = setlistsList[idx];
        const title = item.title?.trim();
        if (!title) continue;

        const artist = item.artist?.trim() || null;
        const session_members = item.session_members?.trim().replaceAll("키보드", "건반") || null;
        const order_num = idx + 1;
        const parsedItemId = item.id ? Number(item.id) : null;

        if (parsedItemId && existingSetlistIds.has(parsedItemId)) {
          // 기존 곡 업데이트
          const { error: updateSetlistError } = await supabase
            .from("setlists")
            .update({
              title,
              artist,
              session_members,
              order_num,
              updated_at: new Date().toISOString(),
            })
            .eq("id", parsedItemId);

          if (updateSetlistError) {
            console.error("셋리스트 수정 실패:", updateSetlistError);
            return { ok: false, error: `곡 '${title}' 수정 실패: ${updateSetlistError.message}` };
          }
        } else {
          // 신규 곡 추가
          const { error: insertSetlistError } = await supabase.from("setlists").insert({
            gig_id: gigId,
            title,
            artist,
            session_members,
            order_num,
          });

          if (insertSetlistError) {
            console.error("셋리스트 추가 실패:", insertSetlistError);
            return { ok: false, error: `곡 '${title}' 추가 실패: ${insertSetlistError.message}` };
          }
        }
      }

      // B. 폼에서 제외된 곡 삭제
      const toDeleteSetlistIds = Array.from(existingSetlistIds).filter(
        (id) => !incomingSetlistIds.has(id)
      );
      if (toDeleteSetlistIds.length > 0) {
        const { error: deleteSetlistError } = await supabase
          .from("setlists")
          .delete()
          .in("id", toDeleteSetlistIds);

        if (deleteSetlistError) {
          console.error("셋리스트 삭제 실패:", deleteSetlistError);
          return { ok: false, error: `셋리스트 삭제 실패: ${deleteSetlistError.message}` };
        }
      }
    } catch (e) {
      console.error("SETLIST 동기화 실패:", e);
      return { ok: false, error: "셋리스트 처리 중 오류가 발생했습니다." };
    }
  }

  revalidatePath("/gigs");
  revalidatePath(`/gigs/${gigId}`, "layout");
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/nominations`);
  revalidatePath(`/gigs/${gigId}/edit`);
  revalidatePath("/");

  return { ok: true, gigId };
}

/** 회원의 공연 참가 여부(RSVP) 제출 또는 수정 */
export async function submitGigRsvp(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const viewer = await getGigViewer();
  const { user } = viewer;

  if (!user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  if (!viewer.isAdmin && !viewer.isApprovedMember) {
    return { ok: false, error: "가입 승인이 완료된 회원만 공연 참가 신청을 할 수 있습니다." };
  }

  const gigId = Number(formData.get("gig_id"));
  if (!Number.isSafeInteger(gigId) || gigId <= 0) {
    return { ok: false, error: "유효하지 않은 공연 ID입니다." };
  }

  const status = String(formData.get("status") ?? "").trim();
  if (!["going", "not_going", "undecided"].includes(status)) {
    return { ok: false, error: "올바른 참여 상태를 선택해 주세요." };
  }

  const submittedParts = formData.getAll("part").map((value) => String(value).trim().replaceAll("키보드", "건반")).filter(Boolean);
  if (status === "going" && submittedParts.some((part) => part.includes(","))) {
    return { ok: false, error: "세션은 한 번에 하나씩 입력해 주세요." };
  }
  const part = Array.from(new Set(submittedParts)).join(", ") || null;
  const note = emptyToNull(formData.get("note"));

  if (status === "going" && !part) {
    return { ok: false, error: "참여할 세션을 선택하거나 직접 추가해 주세요." };
  }

  const [{ data: gig, error: gigError }, { data: performer, error: performerError }] = await Promise.all([
    supabase.from("gigs").select("visibility, is_public").eq("id", gigId).maybeSingle(),
    supabase.from("performers").select("id").eq("gig_id", gigId).eq("user_id", user.id).limit(1).maybeSingle(),
  ]);
  if (gigError || performerError || !gig) {
    if (gigError || performerError) {
      console.error("RSVP 공연/참여자 조회 실패:", { gigId, gigError, performerError });
    }
    if (gigError?.code === "42703" || gigError?.code === "PGRST204") {
      return { ok: false, error: "공연 참가 신청에 필요한 서버 설정이 누락되었습니다. 관리자에게 문의해 주세요." };
    }
    return { ok: false, error: "공연 정보를 확인할 수 없습니다." };
  }
  if (performer) {
    return { ok: false, error: "이미 공연 참여자로 등록되어 있습니다." };
  }
  if (getGigVisibility(gig) === "private" && !viewer.isAdmin) {
    return { ok: false, error: "비공개 공연에는 참가 신청을 할 수 없습니다." };
  }

  const { data: savedRsvp, error } = await supabase.from("gig_rsvps").upsert(
    {
      gig_id: gigId,
      user_id: user.id,
      status: status as "going" | "not_going" | "undecided",
      part: status === "going" ? part : null,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "gig_id,user_id" }
  ).select("id, updated_at").single();

  if (error || !savedRsvp) {
    console.error("RSVP 제출 실패:", error);
    return { ok: false, error: "참가 신청 처리에 실패했습니다." };
  }

  if (status === "going") {
    // The DB trigger creates the notification only when a request enters going.
    // A repeated save has no matching event, so this dispatch is a no-op.
    try {
      await processPendingPushNotifications({
        eventType: "gig_rsvp_requested",
        eventKey: `gig-rsvp:${savedRsvp.id}:${new Date(savedRsvp.updated_at).toISOString()}`,
      });
    } catch (pushError) {
      // The RSVP and notification are committed; cron retries pending delivery.
      console.warn("공연 참여 신청 즉시 푸시 실패, 재시도 대기:", pushError);
    }
  }

  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/join`);
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/gigs");
  revalidatePath(`/admin/gigs/${gigId}`);
  return { ok: true };
}

/** 관리자만 참여 신청을 승인하거나 반려할 수 있습니다. */
export async function reviewGigRsvp(
  gigId: number,
  rsvpId: number,
  updatedAt: string,
  decision: "approve" | "reject"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getIsAdmin())) {
    return { ok: false, error: "관리자만 참가 신청을 처리할 수 있습니다." };
  }
  if (!Number.isSafeInteger(gigId) || gigId <= 0 || !Number.isSafeInteger(rsvpId) || rsvpId <= 0
    || !["approve", "reject"].includes(decision) || !updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    return { ok: false, error: "유효하지 않은 참가 신청입니다." };
  }

  const supabase = await createClient();
  const { data: reviewed, error } = await supabase.rpc("review_gig_rsvp", {
    p_gig_id: gigId,
    p_rsvp_id: rsvpId,
    p_updated_at: updatedAt,
    p_decision: decision,
  });
  if (error) {
    console.error("참가 신청 처리 실패:", error);
    if (error.code === "PGRST202" || error.code === "42883") {
      return { ok: false, error: "참가 신청 승인 기능의 서버 설정이 누락되었습니다. 설정 완료 후 다시 시도해 주세요." };
    }
    return { ok: false, error: "참가 신청을 처리하지 못했습니다. 다시 시도해 주세요." };
  }

  revalidatePath("/gigs");
  revalidatePath(`/gigs/${gigId}`, "layout");
  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/edit`);
  revalidatePath(`/gigs/${gigId}/nominations`);
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/gigs");
  revalidatePath(`/admin/gigs/${gigId}`);
  if (!reviewed) {
    return { ok: false, error: "이미 처리되었거나 변경된 신청입니다. 최신 내역을 확인해 주세요." };
  }
  return { ok: true };
}

/** 공연자 프로필 사진 업데이트 (본인 또는 관리자 전용) */
export async function updatePerformerPhoto(
  performerId: number,
  photoUrl: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const isAdmin = await getIsAdmin();

  // 해당 performer 레코드 조회
  const { data: performer, error: fetchErr } = await supabase
    .from("performers")
    .select("id, user_id, gig_id")
    .eq("id", performerId)
    .single();

  if (fetchErr || !performer) {
    return { ok: false, error: "공연자 정보를 찾을 수 없습니다." };
  }

  // 관리자이거나 본인인 경우에만 수정 허용
  if (!isAdmin && performer.user_id !== user.id) {
    return { ok: false, error: "본인 또는 관리자만 프로필 사진을 변경할 수 있습니다." };
  }

  const { error: updateErr } = await supabase
    .from("performers")
    .update({ photo_url: photoUrl })
    .eq("id", performerId);

  if (updateErr) {
    console.error("공연자 사진 업데이트 실패:", updateErr);
    return { ok: false, error: "사진 저장에 실패했습니다." };
  }

  revalidatePath(`/gigs/${performer.gig_id}`);
  return { ok: true };
}
