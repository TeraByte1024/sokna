import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ticketClient, ticketDatabaseError } from "@/lib/ticket-server";
import { AdminReservationQuantityDialog } from "@/components/tickets/admin-reservation-quantity-dialog";
import { AdminReservationStageActions } from "@/components/tickets/admin-reservation-stage-actions";
import { ReservationControls } from "@/components/tickets/reservation-controls";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { canEditTicketQuantity, ticketDateTime, ticketEventLabels, won } from "@/lib/ticket-reservations";

export const metadata = { title: "예매 처리 내역", robots: { index: false, follow: false } };

export default async function AdminReservationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const client = await ticketClient();
  const [{ data: r, error }, events, funds] = await Promise.all([
    client.from("ticket_reservations").select("*").eq("id", id).maybeSingle(),
    client.from("ticket_reservation_events").select("*").eq("reservation_id", id).order("created_at"),
    client.from("ticket_fund_entries").select("*").eq("reservation_id", id).order("created_at"),
  ]);

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {ticketDatabaseError(error)}
      </p>
    );
  }
  if (!r) notFound();

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/admin/gigs/${r.gig_id}/reservations`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          공연 예매 명단
        </Link>
        <Link
          href="/admin/reservations"
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          전체 예매 관리
        </Link>
      </div>

      <header className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <p className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">
          예매번호 {r.code}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{r.gig_snapshot.title}</h1>
      </header>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 text-sm shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">예매자 및 납부 정보</h2>
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">예매자</dt>
          <dd className="font-medium">{r.buyer_name} · {r.phone}</dd>
          <dt className="text-muted-foreground">입금자명</dt>
          <dd className="font-medium">{r.depositor}</dd>
          <dt className="text-muted-foreground">수량 · 금액</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span>{r.quantity}매 · <strong>{won(r.total_amount)}</strong></span>
            {canEditTicketQuantity(r) && <AdminReservationQuantityDialog reservation={r} action="quantity_updated" />}
          </dd>
          <dt className="text-muted-foreground">현장 입장</dt>
          <dd>{r.admitted_quantity} / {r.quantity}명</dd>
          {r.account_snapshot && (
            <>
              <dt className="text-muted-foreground">납부 계좌</dt>
              <dd className="break-all">
                {r.account_snapshot.bank} {r.account_snapshot.account_number} · {r.account_snapshot.holder}
              </dd>
            </>
          )}
          {r.refund_account && (
            <>
              <dt className="text-muted-foreground">환불 계좌</dt>
              <dd className="break-all font-medium">
                {r.refund_bank} {r.refund_account} · 예금주 {r.refund_holder}
              </dd>
            </>
          )}
          {r.cancellation_reason && (
            <>
              <dt className="text-muted-foreground">취소/환불 사유</dt>
              <dd className="break-words">{r.cancellation_reason}</dd>
            </>
          )}
        </dl>
        {canEditTicketQuantity(r) && (
          <div className="flex flex-wrap gap-2">
            <AdminReservationStageActions reservation={r} confirmPayment />
          </div>
        )}
        <details className="group/disclosure rounded-lg border border-border/60 bg-muted/20 p-3 pt-2.5">
          <DisclosureSummary className="text-xs font-medium text-muted-foreground">
            예매 당시 환불 규정 스냅샷 보기
          </DisclosureSummary>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
            {r.refund_policy_snapshot}
          </p>
        </details>
      </section>

      <ReservationControls key={r.version} reservation={r} admin />

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">실입금·반환 내역</h2>
        {funds.error && <p role="alert" className="text-sm text-destructive">거래 내역을 불러오지 못했습니다.</p>}
        {!funds.error && !funds.data?.length && (
          <p className="text-sm text-muted-foreground">기록된 거래가 없습니다.</p>
        )}
        {(funds.data ?? []).map((f) => (
          <div key={f.id} className="border-t border-border/60 pt-3 text-sm">
            <p className="font-medium">
              {f.direction === "deposit" ? "입금" : "반환"} · <strong>{won(f.amount)}</strong>
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {f.reference} · {ticketDateTime(f.created_at)}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">운영 처리 이력</h2>
        {events.error && <p role="alert" className="text-sm text-destructive">처리 이력을 불러오지 못했습니다.</p>}
        {(events.data ?? []).map((e) => (
          <div key={e.id} className="border-t border-border/60 pt-3 text-sm">
            <p className="font-medium">
              {ticketEventLabels[e.action] ?? "처리 기록"}
              {e.detail && <span className="font-normal text-muted-foreground"> · {e.detail}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {ticketDateTime(e.created_at)} · {e.actor_id === r.user_id ? "예매자" : "운영자"}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
