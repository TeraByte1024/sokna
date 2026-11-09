import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const model = loadTs("lib/ticket-reservations.ts");
test("per-show admission uses the performance date in Korea, supports clearing, and validates the time", () => {
  const { readTicketGigInput } = loadTs("lib/ticket-gig-input.ts");
  const form = new FormData();
  form.set("perform_date", "2026-11-20");
  form.set("perform_time", "19:00:00");
  form.set("admission_starts_at", "2026-11-20T18:30");
  assert.deepEqual(readTicketGigInput(form), { ok: true, value: { admission_starts_at: "2026-11-20T09:30:00.000Z" } });
  form.set("admission_starts_at", "2026-11-20T19:01");
  assert.equal(readTicketGigInput(form).ok, false);
  form.set("admission_starts_at", "2026-11-19T18:30");
  assert.equal(readTicketGigInput(form).ok, false);
  form.set("perform_date", "2026-11-21");
  form.set("admission_starts_at", "2026-11-21T18:30");
  assert.deepEqual(readTicketGigInput(form), { ok: true, value: { admission_starts_at: "2026-11-21T09:30:00.000Z" } });
  form.set("admission_starts_at", "2026-02-30T18:30");
  assert.equal(readTicketGigInput(form).ok, false);
  form.set("admission_starts_at", "");
  assert.deepEqual(readTicketGigInput(form), { ok: true, value: { admission_starts_at: null } });
});
test("admission guidance respects the start boundary and reservation eligibility", () => {
  const performance = model.ticketPerformanceTime("2026-11-20", "19:00");
  const admission = model.ticketPerformanceTime("2026-11-20", "18:30:00");
  assert.equal(performance, Date.parse("2026-11-20T10:00:00Z"));
  assert.equal(model.ticketPerformanceTime("2026-02-30", "19:00"), null);
  assert.equal(model.ticketPerformanceTime("2026-11-20", null), null);
  assert.deepEqual(model.ticketAdmissionGuidance(performance, admission, admission - 1000, true), {
    performance: "공연 시작까지 31분 남았습니다.",
    admission: "입장 시작까지 1분 남았습니다.",
  });
  assert.equal(model.ticketAdmissionGuidance(performance, admission, admission, true).admission, "지금 입장해 주세요!");
  assert.equal(model.ticketAdmissionGuidance(performance, admission, admission, false).admission, null);
  assert.match(model.ticketAdmissionGuidance(performance, null, admission, true).admission, /현장 안내/);
  assert.deepEqual(model.ticketAdmissionGuidance(performance, admission, performance, true), {
    performance: "공연 시작 시각이 지났습니다.",
    admission: null,
  });
});
test("booking deadlines use Korea calendar dates across month/year/leap boundaries", () => {
  assert.equal(model.defaultBookingDeadline("2027-01-01"), "2026-12-31T23:59");
  assert.equal(model.defaultBookingDeadline("2028-03-01"), "2028-02-29T23:59");
  assert.equal(model.defaultBookingDeadline("2026-11-20"), "2026-11-19T23:59");
  assert.equal(model.defaultBookingDeadline(""), "");
  assert.equal(model.bookingDeadlineInput("2026-11-19T14:59:00Z"), "2026-11-19T23:59");
});
test("ticket settings preserve missing legacy inputs and validate enabled sale configuration", () => {
  const { readTicketGigInput } = loadTs("lib/ticket-gig-input.ts");
  assert.deepEqual(readTicketGigInput(new FormData()), { ok: true, value: {} });
  const form = new FormData();
  for (const [key, value] of Object.entries({ notice: " First line\nSecond line ", ticket_booking_enabled: "true", ticket_capacity: "200",
    advance_booking_deadline: "2026-11-19T23:59", ticket_refund_policy: "Admin-defined policy", advance_ticket_price: "0" })) form.set(key, value);
  const result = readTicketGigInput(form); assert.equal(result.ok, true);
  assert.equal(result.value.notice, "First line\nSecond line"); assert.equal(result.value.advance_booking_deadline, "2026-11-19T14:59:00.000Z");
  for (const capacity of ["0", "1.5", "-1", "1000001", "no"]) { form.set("ticket_capacity", capacity); assert.equal(readTicketGigInput(form).ok, false); }
  form.set("ticket_capacity", "200"); form.set("ticket_refund_policy", ""); assert.equal(readTicketGigInput(form).ok, true);
  form.set("advance_booking_starts_at", "2026-11-20T00:00"); assert.equal(readTicketGigInput(form).ok, false);
  form.set("advance_booking_starts_at", "2026-11-10T12:00");
  const withStart = readTicketGigInput(form);
  assert.equal(withStart.ok, true);
  assert.equal(withStart.value.advance_booking_starts_at, "2026-11-10T03:00:00.000Z");
  const gig = { perform_date: "2026-11-20", advance_booking_starts_at: "2026-11-10T03:00:00.000Z", advance_booking_deadline: "2026-11-19T14:59:00.000Z" };
  assert.equal(model.getAdvanceBookingStatus(gig, Date.parse("2026-11-10T02:59:59Z")), "upcoming");
  assert.equal(model.getAdvanceBookingStatus(gig, Date.parse("2026-11-10T03:00:00Z")), "open");
  assert.equal(model.getAdvanceBookingStatus(gig, Date.parse("2026-11-19T14:59:59Z")), "open");
  assert.equal(model.getAdvanceBookingStatus(gig, Date.parse("2026-11-19T15:00:00Z")), "closed");
  form.set("advance_ticket_price", ""); assert.equal(readTicketGigInput(form).ok, false);
});
test("manual booking uses the switch and showtime while scheduled booking requires both dates", () => {
  const { readTicketGigInput } = loadTs("lib/ticket-gig-input.ts");
  const form = new FormData();
  for (const [key, value] of Object.entries({ ticket_booking_mode: "manual", ticket_booking_enabled: "true",
    ticket_capacity: "100", advance_ticket_price: "0", advance_booking_starts_at: "2026-11-18T18:00",
    advance_booking_deadline: "2026-11-19T23:59" })) form.set(key, value);
  const manual = readTicketGigInput(form);
  assert.equal(manual.ok, true);
  assert.equal(manual.value.advance_booking_starts_at, null);
  assert.equal(manual.value.advance_booking_deadline, null);
  const gig = { perform_date: "2026-11-20", perform_time: "19:00", ...manual.value };
  assert.equal(model.getAdvanceBookingStatus(gig, Date.parse("2026-11-20T09:59:00Z")), "open");
  assert.equal(model.getAdvanceBookingStatus(gig, Date.parse("2026-11-20T10:00:00Z")), "closed");
  assert.equal(model.getAdvanceBookingStatus({ ...gig, ticket_booking_enabled: false }, Date.parse("2026-11-18T03:00:00Z")), "closed");
  form.set("ticket_booking_mode", "scheduled");
  assert.equal(readTicketGigInput(form).ok, true);
  form.delete("advance_booking_starts_at");
  assert.equal(readTicketGigInput(form).ok, false);
});
function fixture({ consent = "current", admin = false, error = null } = {}) {
  const calls = [], invalidations = [], pageReads = [];
  const actions = loadTs("app/reservations/actions.ts", {
    "next/cache": { revalidatePath: (...input) => invalidations.push(input) },
    "@/lib/auth-admin": { getIsAdmin: async () => admin },
    "@/app/auth/legal-actions": { getLegalConsentStateAction: async () => ({ status: consent }) },
    "@/lib/ticket-server": {
      ticketDatabaseError: () => "public failure",
      readTicketReservationPage: async (input) => {
        pageReads.push(input);
        return { ok: true, rows: [], hasMore: false };
      },
      ticketClient: async () => ({ rpc: async (name, input) => {
        calls.push({ name, input }); return { data: "reservation-id", error };
      } }),
    },
  });
  return { ...actions, calls, invalidations, pageReads };
}
const input = () => ({ gigId: 7, key: "request-key", name: "Audience", phone: "010-1234-5678", depositor: "Payer", quantity: 2,
  offerHash: "offer", privacyAgreed: true, policyAgreed: true, total: 1, bank: "forged" });
test("reservation creation requires legal acceptance and leaves amounts/identity/accounts to the database", async () => {
  const missing = fixture({ consent: "required" }); assert.equal((await missing.createTicketReservation(input())).ok, false); assert.deepEqual(missing.calls, []);
  const f = fixture(); assert.deepEqual(await f.createTicketReservation(input()), { ok: true, id: "reservation-id" });
  assert.deepEqual(f.calls[0], { name: "create_ticket_reservation", input: { p_gig_id: 7, p_request_key: "request-key", p_name: "Audience", p_phone: "01012345678", p_depositor: "Payer", p_quantity: 2,
    p_offer_hash: "offer", p_privacy_agreed: true, p_policy_agreed: true } });
  const broken = fixture({ error: { message: "secret" } }); assert.deepEqual(await broken.createTicketReservation(input()), { ok: false, error: "public failure" });
});
test("only admins may record funds/refunds/entry or resize reservations and every mutation carries a version", async () => {
  const f = fixture(); for (const action of ["approved", "payment_recorded", "cancelled", "cancel_rejected", "refund_completed", "check_in", "quantity_updated"]) assert.equal((await f.updateTicketReservation("id", 2, action)).ok, false);
  assert.deepEqual(f.calls, []);
  assert.equal((await f.updateTicketReservation("id", 2, "cancel_requested", { reason: "Cancelled" })).ok, true);
  assert.equal(f.calls[0].input.p_version, 2);
  const a = fixture({ admin: true }); assert.equal((await a.updateTicketReservation("id", 3, "check_in", { quantity: 1 })).ok, true);
  assert.equal((await a.updateTicketReservation("id", 3, "quantity_updated", { quantity: 2.5 })).ok, false);
  assert.equal(a.calls.length, 1);
  assert.equal((await a.updateTicketReservation("id", 3, "quantity_updated", { quantity: 4 })).ok, true);
  assert.deepEqual(a.calls[1], { name: "update_ticket_reservation_quantity", input: { p_id: "id", p_quantity: 4, p_version: 3 } });
});
test("account changes require admin access and normalize the entered account number", async () => {
  const account = { bank: "B", number: "123-456-789", holder: "H", instruction: "I" };
  const f = fixture(); assert.equal((await f.savePaymentAccount(account)).ok, false); assert.deepEqual(f.calls, []);
  const a = fixture({ admin: true }); assert.equal((await a.savePaymentAccount(account)).ok, true);
  assert.equal(a.calls[0].input.p_number, "123456789");
  assert.equal((await a.savePaymentAccount({ ...account, number: "broken" })).ok, false); assert.equal(a.calls.length, 1);
});
test("only admins can load further reservation pages, with the search and gig carried forward", async () => {
  const f = fixture();
  assert.equal((await f.loadAdminReservationPage(2, "예매자", 7)).ok, false);
  assert.deepEqual(f.pageReads, []);
  const a = fixture({ admin: true });
  assert.equal((await a.loadAdminReservationPage(0, "", 7)).ok, false);
  assert.equal((await a.loadAdminReservationPage(2, "", -1)).ok, false);
  assert.equal((await a.loadAdminReservationPage(2, "예매자", 7)).ok, true);
  assert.deepEqual(a.pageReads, [{ admin: true, page: 2, query: "예매자", gigId: 7 }]);
});
test("payment instructions show immutable account snapshots only while payment is applicable", () => {
  const { PaymentInstructions } = loadTs("components/tickets/payment-instructions.tsx", {
    react: React,
    sonner: { toast: { success: () => {}, error: () => {} } },
    "@/components/ui/button": { Button: ({ children, ...props }) => React.createElement("button", props, children) },
  });
  const reservation = { status: "awaiting_payment", refund_status: "none", cancellation_requested_at: null, total_amount: 20000, paid_amount: 0, code: "CODE", depositor: "Payer",
    account_snapshot: { bank: "Frozen bank", account_number: "123456789", holder: "Frozen holder", instruction: "Account-specific instructions" } };
  const html = renderToStaticMarkup(React.createElement(PaymentInstructions, { reservation }));
  assert.match(html, /123456789/); assert.match(html, /계좌번호 복사/); assert.match(html, /20,000/);
  assert.match(html, /아래 계좌로 입금해 주세요/); assert.match(html, /Account-specific instructions/);
  const manualConfirmationNotice = /운영진이 입금 내역을 확인한 뒤 예매를 확정하므로 처리에 시간이 걸릴 수 있습니다/;
  assert.match(html, manualConfirmationNotice);
  for (const changes of [{ payment_reported_at: "reported" }, { paid_amount: 5000 }]) {
    const pendingReview = renderToStaticMarkup(React.createElement(PaymentInstructions, { reservation: { ...reservation, ...changes } }));
    assert.match(pendingReview, /다시 송금하지 마세요/); assert.match(pendingReview, /총 예매 금액/);
    assert.match(pendingReview, manualConfirmationNotice);
    assert.doesNotMatch(pendingReview, /아래 계좌로 입금해 주세요|Account-specific instructions/);
  }
  for (const changes of [{ status: "cancelled" }, { status: "approved" }, { paid_amount: 20000 }, { cancellation_requested_at: "date" }, { refund_status: "requested" }, { total_amount: 0 }]) {
    assert.equal(renderToStaticMarkup(React.createElement(PaymentInstructions, { reservation: { ...reservation, ...changes } })), "");
  }
});
test("ticket statuses, list filters, and the admin progress stepper reflect reservation lifecycle", () => {
  assert.equal(model.parseTicketListFilter("refunds"), "refunds");
  assert.equal(model.parseTicketListFilter("unknown"), "all");
  const awaiting = { status: "awaiting_payment", refund_status: "none", cancellation_requested_at: null };
  const refundReq = { status: "approved", refund_status: "requested", cancellation_requested_at: "2026-11-01T00:00:00Z" };
  const approved = { status: "approved", refund_status: "none", cancellation_requested_at: null };
  assert.equal(model.getTicketReservationCategory(awaiting), "예매");
  assert.equal(model.getTicketReservationCategory(refundReq), "환불");
  assert.equal(model.getTicketReservationCategory({ ...refundReq, status: "cancelled", refund_status: "completed" }), "환불");
  assert.equal(model.getTicketReservationCategory({ ...refundReq, status: "cancelled", refund_status: "none" }), "취소");
  assert.equal(model.isRefundRequestItem(awaiting), false);
  assert.equal(model.isRefundRequestItem(refundReq), true);
  assert.equal(model.matchesTicketFilter(refundReq, "refunds"), true);
  assert.equal(model.matchesTicketFilter(approved, "refunds"), false);
  assert.equal(model.matchesTicketFilter(approved, "approved"), true);
  assert.equal(model.ticketStatusTone(approved), "positive");
  assert.equal(model.ticketStatusTone(refundReq), "warning");
  assert.equal(model.ticketStatusTone({ ...approved, status: "cancelled" }), "neutral");
  assert.equal(model.ticketStatusTone({ ...approved, status: "cancelled", refund_status: "completed" }), "neutral");
  assert.equal(model.ticketStatus({ ...awaiting, paid_amount: 5000 }), "입금 확인 중");

  const { TicketStatusBadge, TicketProgressStepper } = loadTs("components/tickets/ticket-status-badge.tsx", {
    react: React,
    "@/lib/utils": { cn: (...inputs) => inputs.filter(Boolean).join(" ") },
    "@/components/ui/badge": { Badge: ({ children, ...props }) => React.createElement("span", props, children) },
    "@/components/ui/status-icons": {
      PositiveStatusIcon: (p) => React.createElement("svg", p),
    },
  });
  const stepperHtml = renderToStaticMarkup(React.createElement(TicketProgressStepper, { reservation: awaiting }));
  assert.match(stepperHtml, /예매자 예매 신청/);
  assert.match(stepperHtml, /계좌 입금/);
  assert.match(stepperHtml, /관리자 입금 확인·확정/);
  assert.doesNotMatch(stepperHtml, /예매 확정 알림/);
  assert.equal(model.formatPhoneNumber("01012345678"), "010-1234-5678");
  const badgeHtml = renderToStaticMarkup(React.createElement(TicketStatusBadge, { reservation: approved }));
  assert.match(badgeHtml, /예매 확정/);

  const admissions = { ...approved, quantity: 2, admitted_quantity: 0 };
  for (const [reservation, label] of [
    [admissions, "예매 확정"],
    [{ ...admissions, admitted_quantity: 1 }, "부분 입장 (1/2매)"],
    [{ ...admissions, admitted_quantity: 2 }, "입장 완료"],
    [{ ...admissions, ...refundReq, admitted_quantity: 2 }, "환불 처리 중"],
    [{ ...admissions, ...refundReq, refund_status: "processing" }, "환불 처리 중"],
    [{ ...admissions, ...refundReq, refund_status: "completed" }, "환불 완료"],
    [{ ...admissions, status: "cancelled", admitted_quantity: 2 }, "예매 취소"],
  ]) {
    assert.equal(model.ticketStatus(reservation, true), label);
    const audienceBadge = renderToStaticMarkup(React.createElement(TicketStatusBadge, { reservation, includeAdmission: true }));
    assert.ok(audienceBadge.includes(`<span>${label}</span>`));
    if (label === "환불 완료" || label === "예매 취소") {
      assert.match(audienceBadge, /bg-muted text-muted-foreground/);
      assert.doesNotMatch(audienceBadge, /<svg/);
    }
  }
  assert.equal(model.ticketStatus({ ...admissions, admitted_quantity: 2 }), "예매 확정");
});
