export type PaymentAccount = {
  id: string;
  bank: string;
  account_number: string;
  holder: string;
  instruction: string;
};

export type TicketOffer = {
  gig_id: number;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  poster_url: string | null;
  unit_price: number | null;
  starts_at?: string | null;
  deadline: string | null;
  remaining: number;
  notice: string;
  refund_policy: string;
  privacy_notice: string;
  account: PaymentAccount | null;
  enabled: boolean;
  open: boolean;
  server_time: string;
  offer_hash: string;
};

export type TicketReservation = {
  id: string;
  code: string;
  user_id: string;
  gig_id: number;
  request_key: string;
  buyer_name: string;
  phone: string;
  depositor: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  gig_snapshot: Pick<TicketOffer, "title" | "date" | "time" | "location">;
  account_id: string | null;
  account_snapshot: PaymentAccount | null;
  notice_snapshot: string;
  refund_policy_snapshot: string;
  privacy_snapshot: string;
  consented_at: string;
  status: "awaiting_payment" | "approved" | "cancelled";
  paid_amount: number;
  payment_reported_at: string | null;
  approved_at: string | null;
  cancellation_requested_at: string | null;
  cancellation_reason: string | null;
  refund_bank: string | null;
  refund_account: string | null;
  refund_holder: string | null;
  refund_status: "none" | "requested" | "processing" | "completed";
  refund_amount: number;
  admitted_quantity: number;
  checked_in_at?: string | null;
  version: number;
  created_at: string;
};

export type TicketEvent = {
  id: string;
  reservation_id: string;
  actor_id: string | null;
  action: string;
  detail: string;
  created_at: string;
};

export type TicketAction =
  | "payment_reported"
  | "payment_recorded"
  | "cancel_requested"
  | "approved"
  | "revoke_approval"
  | "cancelled"
  | "cancel_rejected"
  | "refund_completed"
  | "restore_reservation"
  | "quantity_updated"
  | "check_in"
  | "undo_check_in";

export type TicketListFilter =
  | "all"
  | "awaiting_payment"
  | "refunds"
  | "approved"
  | "cancelled";

export type TicketStatusTone = "positive" | "warning" | "neutral";

export const ticketEventLabels: Record<string, string> = {
  created: "예매 신청",
  payment_reported: "입금 확인 요청",
  payment_recorded: "실입금 기록",
  approved: "입금 확인 완료",
  revoke_approval: "입금 확인 취소",
  cancel_requested: "취소·환불 요청",
  cancelled: "예매 취소",
  cancel_rejected: "취소 요청 반려",
  refund_completed: "환불 완료",
  restore_reservation: "취소·환불 처리 취소",
  quantity_updated: "예매 매수 수정",
  check_in: "입장 확인",
  undo_check_in: "입장 확인 취소",
};

export type TicketStatusTarget = Pick<
  TicketReservation,
  "status" | "refund_status" | "cancellation_requested_at" | "payment_reported_at" | "paid_amount" |
  "quantity" | "admitted_quantity"
>;

export function isTicketAdmissionComplete(r: Pick<TicketReservation, "quantity" | "admitted_quantity">) {
  return r.quantity > 0 && r.admitted_quantity >= r.quantity;
}

export function canEditTicketQuantity(r: Pick<TicketReservation, "status" | "refund_status" | "cancellation_requested_at">) {
  return r.status !== "cancelled" && r.refund_status === "none" && !r.cancellation_requested_at;
}

export function canCheckInTicketReservation(r: TicketReservation) {
  return r.status === "approved" && canEditTicketQuantity(r) && !isTicketAdmissionComplete(r);
}

export const ticketStatus = (r: TicketStatusTarget, includeAdmission = false) => {
  if (r.refund_status === "completed") return "환불 완료";
  if (r.refund_status === "processing" || r.refund_status === "requested") return "환불 처리 중";
  if (r.status === "cancelled") return "예매 취소";
  if (r.cancellation_requested_at) return "취소·환불 검토 중";
  if (r.status === "approved") {
    if (includeAdmission && r.quantity > 0 && r.admitted_quantity > 0) {
      return isTicketAdmissionComplete(r)
        ? "입장 완료"
        : `부분 입장 (${r.admitted_quantity}/${r.quantity}매)`;
    }
    return "예매 확정";
  }
  return r.payment_reported_at || r.paid_amount > 0 ? "입금 확인 중" : "입금 대기";
};

export const ticketStatusTone = (
  r: Pick<
    TicketReservation,
    "status" | "refund_status" | "cancellation_requested_at" | "payment_reported_at"
  >,
): TicketStatusTone => {
  if (r.refund_status === "completed") return "neutral";
  if (r.refund_status === "processing" || r.refund_status === "requested") return "warning";
  if (r.status === "cancelled") return "neutral";
  if (r.cancellation_requested_at) return "warning";
  if (r.status === "approved") return "positive";
  return "warning";
};

export const isRefundRequestItem = (
  r: Pick<TicketReservation, "status" | "refund_status" | "cancellation_requested_at">,
): boolean => {
  return (
    Boolean(r.cancellation_requested_at) ||
    r.refund_status === "requested" ||
    r.refund_status === "processing" ||
    r.refund_status === "completed"
  );
};

export function getTicketReservationCategory(
  r: Pick<TicketReservation, "status" | "refund_status" | "cancellation_requested_at">,
) {
  if (r.refund_status !== "none") return "환불";
  if (r.status === "cancelled" || r.cancellation_requested_at) return "취소";
  return "예매";
}

export function canRequestTicketCancellationOrRefund(
  r: Pick<TicketReservation, "status" | "cancellation_requested_at" | "refund_status" | "refund_account">,
) {
  return (r.status !== "cancelled" && !r.cancellation_requested_at) ||
    (r.status === "cancelled" && r.refund_status === "requested" && !r.refund_account);
}

export function getTicketPaymentAccount(r: TicketReservation) {
  return r.status === "awaiting_payment" && r.total_amount > 0 && !isRefundRequestItem(r)
    ? r.account_snapshot
    : null;
}

export function parseTicketListFilter(value?: string): TicketListFilter {
  if (
    value === "awaiting_payment" ||
    value === "refunds" ||
    value === "approved" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "all";
}

export function matchesTicketFilter(
  r: Pick<TicketReservation, "status" | "refund_status" | "cancellation_requested_at">,
  filter: TicketListFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "refunds") return isRefundRequestItem(r);
  if (filter === "awaiting_payment") {
    return (
      r.status === "awaiting_payment" &&
      !r.cancellation_requested_at &&
      r.refund_status === "none"
    );
  }
  if (filter === "approved") {
    return r.status === "approved" && !r.cancellation_requested_at;
  }
  if (filter === "cancelled") {
    return r.status === "cancelled" && r.refund_status === "none";
  }
  return true;
}

export const ticketDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "미설정";

export const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

export const formatPhoneNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (/^\d{3}\d{3,4}\d{4}$/.test(digits)) {
    return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
  }
  return phone;
};

/** A null deadline uses the performance's previous calendar day at 23:59 KST. */
export function defaultBookingDeadline(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const previous = new Date(`${date}T00:00:00+09:00`);
  if (!Number.isFinite(previous.getTime())) return "";
  return (
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(previous.getTime() - 86400_000)) + "T23:59"
  );
}

export function bookingDeadlineInput(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(" ", "T");
}

export function ticketPerformanceTime(date: string, time: string | null): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) {
    return null;
  }
  const localMinute = `${date}T${time.slice(0, 5)}`;
  const timestamp = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}+09:00`);
  return Number.isFinite(timestamp) && bookingDeadlineInput(new Date(timestamp).toISOString()) === localMinute
    ? timestamp
    : null;
}

function ticketTimeRemaining(milliseconds: number) {
  const minutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return [
    days && `${days}일`,
    hours && `${hours}시간`,
    minutes % 60 && `${minutes % 60}분`,
  ].filter(Boolean).join(" ");
}

export function ticketAdmissionGuidance(
  performanceMs: number | null,
  admissionMs: number | null,
  nowMs: number,
  canEnter: boolean,
) {
  if (performanceMs === null) return { performance: null, admission: null };
  if (nowMs >= performanceMs) {
    return { performance: "공연 시작 시각이 지났습니다.", admission: null };
  }

  const performance = `공연 시작까지 ${ticketTimeRemaining(performanceMs - nowMs)} 남았습니다.`;
  if (!canEnter) return { performance, admission: null };
  if (admissionMs === null) {
    return { performance, admission: "입장 시각은 공연 유의사항이나 현장 안내를 확인해 주세요." };
  }
  if (nowMs < admissionMs) {
    return { performance, admission: `입장 시작까지 ${ticketTimeRemaining(admissionMs - nowMs)} 남았습니다.` };
  }
  return { performance, admission: "지금 입장해 주세요. 현장에서 예매번호나 예매자 이름을 알려 주세요." };
}

export type TicketBookingMode = "manual" | "scheduled";

export function getAdvanceBookingStatus(
  gig: {
    perform_date?: string | null;
    perform_time?: string | null;
    ticket_booking_enabled?: boolean;
    ticket_booking_mode?: string | null;
    advance_booking_starts_at?: string | null;
    advance_booking_deadline?: string | null;
  },
  nowMs: number = Date.now(),
): "upcoming" | "open" | "closed" {
  if (!gig.perform_date || gig.ticket_booking_enabled === false) return "closed";
  const performanceMs = ticketPerformanceTime(gig.perform_date, gig.perform_time || "23:59");
  if (performanceMs === null || nowMs >= performanceMs) return "closed";
  if (gig.ticket_booking_mode === "manual") return "open";

  const fallback = gig.ticket_booking_mode == null ? defaultBookingDeadline(gig.perform_date) : "";
  const deadlineSource = gig.advance_booking_deadline || (fallback ? `${fallback}:00+09:00` : "");

  const deadlineMs = Date.parse(deadlineSource);
  if (!Number.isFinite(deadlineMs)) return "closed";
  const endMs = Math.min(Math.floor(deadlineMs / 60_000) * 60_000 + 60_000, performanceMs);
  const startMs = Math.floor(Date.parse(gig.advance_booking_starts_at ?? "") / 60_000) * 60_000;
  if (gig.ticket_booking_mode === "scheduled" && !Number.isFinite(startMs)) return "closed";
  if (nowMs >= endMs || startMs >= endMs) return "closed";
  return nowMs < startMs ? "upcoming" : "open";
}
