"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const GIG_ATTENDEES_TABLE = "gig_attendees";

export interface AttendanceActionResult {
  ok: boolean;
  error?: string;
}

export interface AttendeeCount {
  attending: number;
  declined: number;
  uncertain: number;
  total: number;
}

/** gig_attendees 테이블에 삽입할 레코드 타입 (DB 마이그레이션 후 generated types로 교체 가능) */
interface GigAttendeeInsert {
  gig_id: number;
  name: string;
  generation: number | null;
  part: string | null;
  phone: string | null;
  attendance_status: string;
  guests_count: number;
  memo: string | null;
}

export async function submitGigAttendance(
  formData: FormData
): Promise<AttendanceActionResult> {
  try {
    const gigIdRaw = formData.get("gig_id");
    const name = String(formData.get("name") ?? "").trim();
    const generationRaw = formData.get("generation");
    const part = String(formData.get("part") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const attendanceStatus =
      String(formData.get("attendance_status") ?? "attending").trim();
    const guestsCountRaw = formData.get("guests_count");
    const memo = String(formData.get("memo") ?? "").trim() || null;

    if (!gigIdRaw) {
      return { ok: false, error: "공연 정보가 누락되었습니다." };
    }
    if (!name) {
      return { ok: false, error: "성함을 입력해 주세요." };
    }

    const gigId = Number(gigIdRaw);
    const generation = generationRaw ? Number(generationRaw) : null;
    const guestsCount = guestsCountRaw ? Number(guestsCountRaw) : 0;

    if (!["attending", "declined", "uncertain"].includes(attendanceStatus)) {
      return { ok: false, error: "참석 여부를 올바르게 선택해 주세요." };
    }

    const supabase = await createClient();

    const record: GigAttendeeInsert = {
      gig_id: gigId,
      name,
      generation,
      part,
      phone,
      attendance_status: attendanceStatus,
      guests_count: guestsCount,
      memo,
    };

    // gig_attendees 테이블은 마이그레이션 후 추가되므로 타입 단언 사용
    const { error } = await (supabase as unknown as {
      from: (table: string) => {
        insert: (values: GigAttendeeInsert) => Promise<{ error: { message: string } | null }>;
      };
    }).from(GIG_ATTENDEES_TABLE).insert(record);

    if (error) {
      console.error("참석 등록 실패:", error);
      return { ok: false, error: "참석 등록에 실패했습니다. 다시 시도해 주세요." };
    }

    revalidatePath("/40th-anniversary");
    return { ok: true };
  } catch (err) {
    console.error("참석 등록 중 예외 발생:", err);
    return { ok: false, error: "처리 중 오류가 발생했습니다." };
  }
}

export async function getGigAttendeesCount(
  gigId: number
): Promise<AttendeeCount> {
  try {
    const supabase = await createClient();

    // gig_attendees 테이블은 마이그레이션 후 추가되므로 타입 단언 사용
    const { data, error } = await (supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: number) => Promise<{
            data: { attendance_status: string }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    }).from(GIG_ATTENDEES_TABLE).select("attendance_status").eq("gig_id", gigId);

    if (error || !data) {
      console.error("참석자 조회 실패:", error);
      return { attending: 0, declined: 0, uncertain: 0, total: 0 };
    }

    const attending = data.filter(
      (r) => r.attendance_status === "attending"
    ).length;
    const declined = data.filter(
      (r) => r.attendance_status === "declined"
    ).length;
    const uncertain = data.filter(
      (r) => r.attendance_status === "uncertain"
    ).length;

    return { attending, declined, uncertain, total: data.length };
  } catch (err) {
    console.error("참석자 조회 중 예외 발생:", err);
    return { attending: 0, declined: 0, uncertain: 0, total: 0 };
  }
}
