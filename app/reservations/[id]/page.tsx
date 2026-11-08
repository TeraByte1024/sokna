import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { Card } from "@/components/ui/card";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { ticketClient } from "@/lib/ticket-server";
import { getGigRow } from "@/lib/gig-server-data";
import { AdmissionGuidance } from "@/components/tickets/admission-guidance";
import { PaymentInstructions } from "@/components/tickets/payment-instructions";
import { ReservationControls } from "@/components/tickets/reservation-controls";
import { TicketNotice } from "@/components/tickets/ticket-notice";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import {
  canRequestTicketCancellationOrRefund,
  formatPhoneNumber,
  getTicketPaymentAccount,
  isRefundRequestItem,
  isTicketAdmissionComplete,
  ticketDateTime,
  ticketPerformanceTime,
  won,
} from "@/lib/ticket-reservations";
import { formatKoreanDateTime, parseDateTime } from "@/lib/utils";

export const metadata = { title: "예매 상세", robots: { index: false, follow: false } };
const contactEmail = "sokna1986hanyang@gmail.com";

export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const client = await ticketClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect(`/auth/login?redirect=${encodeURIComponent(`/reservations/${id}`)}`);

  const { data: r, error } = await client
    .from("ticket_reservations")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error("예매 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  if (!r) notFound();

  const { data: currentGig } = await getGigRow(r.gig_id);
  const gig = currentGig
    ? {
        title: currentGig.title || r.gig_snapshot.title,
        date: currentGig.perform_date,
        time: currentGig.perform_time,
        location: currentGig.location,
      }
    : r.gig_snapshot;
  const admissionTimestamp = Date.parse(currentGig?.admission_starts_at ?? "");
  const admissionMs = Number.isFinite(admissionTimestamp) ? admissionTimestamp : null;
  const admission = parseDateTime(currentGig?.admission_starts_at);
  const showPayment = Boolean(getTicketPaymentAccount(r));
  const canEnter = r.status === "approved" && !isRefundRequestItem(r);
  const showRefundAmount = r.refund_status === "processing" || r.refund_status === "completed";
  const showCancellationDetails =
    (r.status === "cancelled" || isRefundRequestItem(r)) &&
    (r.cancellation_reason || showRefundAmount || r.refund_account);
  const privacyIncludesContact = r.privacy_snapshot?.endsWith(contactEmail);
  const contactLink = (
    <a className="break-all underline underline-offset-4" href={`mailto:${contactEmail}`}>
      {contactEmail}
    </a>
  );

  return (
    <SiteLayout>
      <PageContainer>
        <div className="w-full space-y-5">
          <nav aria-label="예매 상세 바로가기" className="text-sm">
            <Link
              href="/reservations"
              className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              내 예매
            </Link>
          </nav>

          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">예매 상세</h1>
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-labelledby="reservation-gig-heading" className="min-w-0 space-y-4">
              <Card className="space-y-3 p-4 shadow-sm sm:p-5">
                <h2 id="reservation-gig-heading" className="font-semibold">공연 정보</h2>
                <Link
                  href={`/gigs/${r.gig_id}`}
                  className="flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline focus-visible:underline"
                >
                  <span className="min-w-0 break-words break-keep">{gig.title}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
                <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">공연 일시</dt>
                  <dd>{formatKoreanDateTime(gig.date, gig.time?.slice(0, 5))}</dd>
                  <dt className="text-muted-foreground">공연 장소</dt>
                  <dd className="break-words">{gig.location || "추후 안내"}</dd>
                  <dt className="text-muted-foreground">입장 시작</dt>
                  <dd>{admission.date ? formatKoreanDateTime(admission.date, admission.time) : "추후 안내"}</dd>
                </dl>
                <AdmissionGuidance
                  performanceMs={ticketPerformanceTime(gig.date, gig.time)}
                  admissionMs={admissionMs}
                  initialNow={Date.now()}
                  canEnter={canEnter && !isTicketAdmissionComplete(r)}
                />
              </Card>
              <TicketNotice title="공연 유의사항" body={r.notice_snapshot} />
            </section>

            <section aria-labelledby="reservation-info-heading" className="min-w-0 space-y-4">
              <Card className="space-y-3 p-4 shadow-sm sm:p-5">
                <h2 id="reservation-info-heading" className="font-semibold">예매 정보</h2>
                <dl className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">예매번호</dt>
                  <dd className="break-words font-mono font-semibold">{r.code}</dd>
                  <dt className="text-muted-foreground">예매 현황</dt>
                  <dd><TicketStatusBadge reservation={r} includeAdmission className="h-auto min-h-6" /></dd>
                  <dt className="text-muted-foreground">예매자</dt>
                  <dd className="break-words">{r.buyer_name}</dd>
                  <dt className="text-muted-foreground">전화번호</dt>
                  <dd className="tabular-nums">{formatPhoneNumber(r.phone)}</dd>
                  <dt className="text-muted-foreground">예매 수량</dt>
                  <dd className="tabular-nums">{r.quantity}매</dd>
                  {!showPayment && (
                    <>
                      {r.total_amount > 0 && (
                        <>
                          <dt className="text-muted-foreground">입금자명</dt>
                          <dd className="break-words">{r.depositor}</dd>
                        </>
                      )}
                      <dt className="text-muted-foreground">총 예매 금액</dt>
                      <dd className="font-medium tabular-nums">{won(r.total_amount)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">접수 일시</dt>
                  <dd>{ticketDateTime(r.created_at)}</dd>
                </dl>
              </Card>

              {showPayment && <PaymentInstructions reservation={r} />}

              {showCancellationDetails && (
                <Card className="space-y-3 p-4 shadow-sm sm:p-5">
                  <h2 className="font-semibold">취소·환불 정보</h2>
                  <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-2 text-sm">
                    {r.cancellation_reason && (
                      <>
                        <dt className="text-muted-foreground">처리 사유</dt>
                        <dd className="break-words">{r.cancellation_reason}</dd>
                      </>
                    )}
                    {showRefundAmount && (
                      <>
                        <dt className="text-muted-foreground">확정 환불액</dt>
                        <dd className="font-medium tabular-nums">{won(r.refund_amount)}</dd>
                      </>
                    )}
                    {r.refund_account && (
                      <>
                        <dt className="text-muted-foreground">환불 계좌</dt>
                        <dd className="break-words">
                          {r.refund_bank} <span className="break-all">{r.refund_account}</span>
                          {r.refund_holder && ` · 예금주 ${r.refund_holder}`}
                        </dd>
                      </>
                    )}
                  </dl>
                </Card>
              )}
              <TicketNotice
                title="예매·취소/환불 안내"
                body={r.refund_policy_snapshot}
                actions={canRequestTicketCancellationOrRefund(r)
                  ? <ReservationControls key={r.version} reservation={r} />
                  : null}
              />
            </section>
          </div>

          <details className="group/disclosure rounded-xl border px-4 py-3">
            <DisclosureSummary className="text-sm font-medium">
              {r.privacy_snapshot ? "예매 개인정보 수집·이용 동의 및 문의" : "예매·환불 문의"}
            </DisclosureSummary>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {r.privacy_snapshot && (
                <p className="whitespace-pre-wrap break-words">
                  {privacyIncludesContact
                    ? <>{r.privacy_snapshot.slice(0, -contactEmail.length)}{contactLink}</>
                    : r.privacy_snapshot}
                </p>
              )}
              {!privacyIncludesContact && <p>예매·환불 문의 {contactLink}</p>}
            </div>
          </details>
        </div>
      </PageContainer>
    </SiteLayout>
  );
}
