import type { TicketGigFields } from "@/lib/ticket-database";
import { bookingDeadlineInput, ticketPerformanceTime } from "@/lib/ticket-reservations";

export function readTicketGigInput(form: FormData): { ok: true; value: TicketGigFields } | { ok: false; error: string } {
  const value: TicketGigFields = {};
  if (form.has("admission_starts_at")) {
    const admission = String(form.get("admission_starts_at") ?? "").trim();
    value.admission_starts_at = null;
    if (admission) {
      const performanceDate = String(form.get("perform_date") ?? "").trim();
      const timestamp = Date.parse(`${admission}:00+09:00`);
      if (
        !Number.isFinite(timestamp) ||
        bookingDeadlineInput(new Date(timestamp).toISOString()) !== admission ||
        admission.slice(0, 10) !== performanceDate
      ) {
        return { ok: false, error: "공연 날짜 기준으로 입장 시작 시간을 입력해 주세요." };
      }
      const performance = ticketPerformanceTime(
        performanceDate,
        String(form.get("perform_time") ?? "").trim(),
      );
      if (performance === null || timestamp > performance) {
        return { ok: false, error: "공연 시작 시간을 입력하고 입장 시작을 공연 시작 이전으로 설정해 주세요." };
      }
      value.admission_starts_at = new Date(timestamp).toISOString();
    }
  }
  if (form.has("notice")) {
    const notice = String(form.get("notice") ?? "").trim();
    if (notice.length > 10000) return { ok: false, error: "공연 유의사항은 10000자 이내로 입력해 주세요." };
    value.notice = notice || null;
  }
  if (!form.has("ticket_booking_enabled")) return { ok: true, value };
  const enabled = form.get("ticket_booking_enabled");
  const mode = form.get("ticket_booking_mode");
  if (mode !== null && mode !== "manual" && mode !== "scheduled") {
    return { ok: false, error: "사전예매 운영 방식을 확인해 주세요." };
  }
  const capacity = String(form.get("ticket_capacity") ?? "").trim();
  const startsAt = mode === "manual" ? "" : String(form.get("advance_booking_starts_at") ?? "").trim();
  const deadline = mode === "manual" ? "" : String(form.get("advance_booking_deadline") ?? "").trim();
  const policy = String(form.get("ticket_refund_policy") ?? "").trim();
  if (!["true", "false"].includes(String(enabled)) || (capacity && (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 1000000))) return { ok: false, error: "판매 매수를 확인해 주세요." };
  if (policy.length > 10000) return { ok: false, error: "취소/환불 안내는 10000자 이내로 입력해 주세요." };
  if (mode === "scheduled" && (enabled !== "true" || !startsAt || !deadline)) {
    return { ok: false, error: "기간 지정 예매의 시작 일시와 마감 일시를 입력해 주세요." };
  }
  const startTimestamp = startsAt ? Date.parse(`${startsAt}:00+09:00`) : null;
  if (startsAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt) || !Number.isFinite(startTimestamp))) return { ok: false, error: "사전예매 시작 일시를 확인해 주세요." };
  const timestamp = deadline ? Date.parse(`${deadline}:00+09:00`) : null;
  if (deadline && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline) || !Number.isFinite(timestamp))) return { ok: false, error: "사전예매 마감 일시를 확인해 주세요." };
  if (startTimestamp !== null && timestamp !== null && startTimestamp > timestamp) return { ok: false, error: "사전예매 시작 일시는 마감 일시보다 빠르거나 같아야 합니다." };
  if (enabled === "true" && (!capacity || !String(form.get("advance_ticket_price") ?? "").trim())) return { ok: false, error: "예매를 받으려면 사전예매 가격과 판매 매수를 입력해 주세요." };
  return {
    ok: true,
    value: {
      ...value,
      ticket_booking_enabled: enabled === "true",
      ...(mode ? { ticket_booking_mode: mode } : {}),
      ticket_capacity: capacity ? Number(capacity) : null,
      advance_booking_starts_at: startTimestamp === null ? null : new Date(startTimestamp).toISOString(),
      advance_booking_deadline: timestamp === null ? null : new Date(timestamp).toISOString(),
      ticket_refund_policy: policy || null,
    },
  };
}
