"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Loader2,
  MapPin,
  RotateCcw,
  UserCheck,
  X,
} from "lucide-react";
import { updateTicketReservation } from "@/app/reservations/actions";
import { AdminReservationQuantityDialog } from "@/components/tickets/admin-reservation-quantity-dialog";
import { AdminReservationStageActions } from "@/components/tickets/admin-reservation-stage-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  canEditTicketQuantity,
  formatPhoneNumber,
  getTicketReservationCategory,
  isRefundRequestItem,
  isTicketAdmissionComplete,
  ticketDateTime,
  won,
  type TicketAction,
  type TicketReservation,
} from "@/lib/ticket-reservations";
import { cn } from "@/lib/utils";

export function AdminReservationItem({
  reservation: r,
  onUpdated,
}: {
  reservation: TicketReservation;
  onUpdated: (reservation: TicketReservation | null) => void;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<TicketAction | null>(null);
  const detailsRef = useRef<HTMLDialogElement>(null);
  const [copiedRefund, setCopiedRefund] = useState(false);
  const [adminReason, setAdminReason] = useState(r.cancellation_reason ?? "");

  const isRefundItem = isRefundRequestItem(r);
  const category = getTicketReservationCategory(r);
  const isOpenRefund = category === "환불" && r.refund_status !== "completed";
  const isCancelled = r.status === "cancelled";
  const isActiveItem = !isRefundItem && !isCancelled;
  const isApproved = r.status === "approved";
  const hasAdmissions = r.admitted_quantity > 0;
  const admissionComplete = isTicketAdmissionComplete(r);
  const admissionSummary = `${admissionComplete ? "입장 완료" : "부분 입장"} (${r.admitted_quantity}/${r.quantity}명)`;

  const handleAction = async (
    action: TicketAction,
    payload: Record<string, string | number | boolean> = {},
    successMessage: string,
  ) => {
    if (pendingAction) return;
    setPendingAction(action);
    try {
      const result = await updateTicketReservation(r.id, r.version, action, payload, true);
      if (result.ok) {
        onUpdated(result.reservation ?? null);
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("처리에 실패했습니다. 새로고침 후 다시 시도해 주세요.");
    } finally {
      setPendingAction(null);
    }
  };

  const copyRefundAccount = async () => {
    if (!r.refund_account) return;
    try {
      await navigator.clipboard.writeText(
        `${r.refund_bank ?? ""} ${r.refund_account} (${r.refund_holder ?? ""})`.trim(),
      );
      setCopiedRefund(true);
      toast.success("환불 계좌 정보를 복사했습니다.");
      window.setTimeout(() => setCopiedRefund(false), 2000);
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  return (
    <>
      {/* 컴팩트 예매 목록 아이템 (클릭 시 상세 다이얼로그 오픈) */}
      <article
        className={cn(
          "group relative flex flex-col justify-between gap-3 rounded-xl border bg-card py-3 pl-4 pr-10 shadow-2xs transition-colors hover:border-foreground/25 hover:bg-accent/20 sm:flex-row sm:items-center",
          isOpenRefund ? "border-amber-500/45" : "border-border/70",
        )}
      >
        {/* 좌측: 최소화된 핵심 예매자·금액 정보 */}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`${category} · ${r.buyer_name} 예매 상세 보기`}
          onClick={() => detailsRef.current?.showModal()}
          className="min-w-0 flex-1 cursor-pointer space-y-1 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold",
              category === "예매"
                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                : isOpenRefund
                  ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "bg-muted text-muted-foreground",
            )}>
              {category}
            </span>
            <span className="text-base font-bold tracking-tight text-foreground">
              {r.buyer_name}
            </span>
            <span className="text-xs text-muted-foreground">
              (입금자 {r.depositor})
            </span>
            <span className="text-xs text-muted-foreground">
              · {formatPhoneNumber(r.phone)}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {r.quantity}매 · <strong className="text-primary">{won(r.total_amount)}</strong>
            </span>
            {isRefundItem && r.refund_bank && (
              <span>
                · 환불계좌: {r.refund_bank} {r.refund_account} ({r.refund_holder})
              </span>
            )}
            {!isRefundItem && isCancelled && r.cancellation_reason && (
              <span className="truncate">· 사유: {r.cancellation_reason}</span>
            )}
          </span>
        </button>
        <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />

        {(isActiveItem || isOpenRefund) && (
          <div className="relative flex flex-wrap items-center gap-2 sm:shrink-0">
            {isActiveItem && isApproved && hasAdmissions && (
              <span className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
                admissionComplete
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}>
                {admissionComplete && <UserCheck className="size-3.5" aria-hidden="true" />}
                {admissionSummary}
              </span>
            )}
            {isActiveItem && (
              <AdminReservationStageActions reservation={r} compact disabled={pendingAction !== null} onUpdated={onUpdated} />
            )}
            {isOpenRefund && (
              <Button
                type="button"
                size="sm"
                disabled={pendingAction !== null}
                onClick={() =>
                  void handleAction("refund_completed", {}, `${r.buyer_name}님의 환불 완료 처리가 기록되었습니다.`)
                }
                className="h-7 px-2.5 text-xs font-bold"
              >
                {pendingAction === "refund_completed" && (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                )}
                환불 완료 처리
              </Button>
            )}
          </div>
        )}
      </article>

      {/* 상세 정보 및 환불·취소 처리 Dialog */}
        <dialog
          ref={detailsRef}
          aria-labelledby={`dialog-title-${r.id}`}
          onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
          className="ticket-dialog max-w-lg rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60"
        >
          <div
            className="space-y-5 p-5 sm:p-6"
          >
            {/* 헤더: 예매번호 + 닫기 */}
            <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3.5">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">
                    예매번호 {r.code}
                  </span>
                </div>
                <h3 id={`dialog-title-${r.id}`} className="text-lg font-bold tracking-tight">
                  {r.buyer_name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    (입금자 {r.depositor})
                  </span>
                </h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="상세 창 닫기"
                onClick={() => detailsRef.current?.close()}
                className="size-8 shrink-0"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            {/* 공연 정보 */}
            <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/25 p-3.5 text-xs sm:text-sm">
              <p className="text-xs font-semibold text-muted-foreground">공연 정보</p>
              <p className="text-sm font-bold text-foreground">{r.gig_snapshot.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {r.gig_snapshot.date} {r.gig_snapshot.time?.slice(0, 5)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {r.gig_snapshot.location || "장소 추후 안내"}
                </span>
              </div>
            </div>

            {/* 예매 상세 내역 */}
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs sm:text-sm">
              <dt className="text-muted-foreground">예매자</dt>
              <dd className="font-medium">{r.buyer_name}</dd>
              <dt className="text-muted-foreground">입금자명</dt>
              <dd className="font-medium">{r.depositor}</dd>
              <dt className="text-muted-foreground">전화번호</dt>
              <dd className="font-medium tabular-nums">{formatPhoneNumber(r.phone)}</dd>
              <dt className="text-muted-foreground">수량 · 총액</dt>
              <dd className="flex flex-wrap items-center gap-2 font-bold">
                <span>{r.quantity}매 · <span className="text-primary">{won(r.total_amount)}</span></span>
                {canEditTicketQuantity(r) && (
                  <AdminReservationQuantityDialog reservation={r} action="quantity_updated" disabled={pendingAction !== null} onUpdated={onUpdated} />
                )}
              </dd>
              <dt className="text-muted-foreground">예매 신청 일시</dt>
              <dd className="tabular-nums text-muted-foreground">{ticketDateTime(r.created_at)}</dd>
              <dt className="text-muted-foreground">입금 확인 일시</dt>
              <dd className="flex flex-wrap items-center gap-2 tabular-nums text-muted-foreground">
                <span>{isApproved ? r.approved_at ? ticketDateTime(r.approved_at) : "확인 완료" : "미확인"}</span>
              </dd>
              <dt className="text-muted-foreground">입장 확인 일시</dt>
              <dd className="flex flex-wrap items-center gap-2 tabular-nums text-muted-foreground">
                <span>
                  {hasAdmissions
                    ? r.checked_in_at
                      ? `${ticketDateTime(r.checked_in_at)} (${r.admitted_quantity}/${r.quantity}명)`
                      : admissionSummary
                    : "미입장"}
                </span>
              </dd>
            </dl>

            {isActiveItem && (
              <div className="flex flex-wrap gap-2">
                <AdminReservationStageActions reservation={r} disabled={pendingAction !== null} onUpdated={onUpdated} />
              </div>
            )}

            {/* 환불 계좌 정보 (있을 경우) */}
            {(r.refund_account || r.cancellation_reason) && (
              <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-amber-950 dark:text-amber-200">
                    환불 · 취소 상세 정보
                  </span>
                  {r.refund_account && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyRefundAccount()}
                      className="h-7 gap-1 border-amber-500/30 bg-background px-2.5 text-[11px] font-semibold"
                    >
                      {copiedRefund ? (
                        <Check className="size-3 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <Copy className="size-3" aria-hidden="true" />
                      )}
                      <span>{copiedRefund ? "복사됨" : "환불계좌 복사"}</span>
                    </Button>
                  )}
                </div>
                {r.refund_account && (
                  <p className="break-all font-mono text-sm font-bold text-foreground">
                    {r.refund_bank} {r.refund_account} · 예금주 {r.refund_holder}
                  </p>
                )}
                {r.cancellation_reason && (
                  <p className="break-words text-muted-foreground">
                    사유: <span className="font-medium text-foreground">{r.cancellation_reason}</span>
                  </p>
                )}
              </div>
            )}

            {/* 환불 및 취소 처리 컨트롤 (내역 삭제 없이 상태만 변경/복구) */}
            <div className="space-y-3 border-t border-border/60 pt-4">
              <p className="text-xs font-bold text-foreground">환불 및 예매 취소 처리</p>
              <Input
                value={adminReason}
                onChange={(e) => setAdminReason(e.target.value)}
                placeholder="취소·환불 처리 메모 또는 사유 (선택)"
                maxLength={1000}
                className="h-9 text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                {r.refund_status !== "completed" && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pendingAction !== null}
                    onClick={() =>
                      void handleAction(
                        "refund_completed",
                        { reason: adminReason },
                        `${r.buyer_name}님의 환불 완료 처리가 기록되었습니다.`,
                      )
                    }
                    className="h-9 gap-1.5 font-bold"
                  >
                    {pendingAction === "refund_completed" && (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    )}
                    <span>환불 완료 처리</span>
                  </Button>
                )}

                {r.status !== "cancelled" && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pendingAction !== null}
                    onClick={() =>
                      void handleAction(
                        "cancelled",
                        { reason: adminReason },
                        `${r.buyer_name}님의 예매 취소 처리가 기록되었습니다.`,
                      )
                    }
                    className="h-9 gap-1.5 font-bold"
                  >
                    {pendingAction === "cancelled" && (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    )}
                    <span>예매 취소 처리</span>
                  </Button>
                )}

                {r.cancellation_requested_at && r.status !== "cancelled" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingAction !== null}
                    onClick={() =>
                      void handleAction(
                        "cancel_rejected",
                        { reason: adminReason },
                        `${r.buyer_name}님의 환불/취소 요청을 반려했습니다.`,
                      )
                    }
                    className="h-9 gap-1.5 font-semibold"
                  >
                    {pendingAction === "cancel_rejected" && (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    )}
                    <span>환불 요청 반려</span>
                  </Button>
                )}

                {(r.status === "cancelled" || r.refund_status === "completed") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pendingAction !== null}
                    onClick={() =>
                      void handleAction(
                        "restore_reservation",
                        { reason: adminReason },
                        `${r.buyer_name}님의 취소·환불 처리를 취소(복구)했습니다.`,
                      )
                    }
                    className="h-9 gap-1.5 font-semibold"
                  >
                    {pendingAction === "restore_reservation" ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="size-3.5" aria-hidden="true" />
                    )}
                    <span>취소·환불 처리 취소</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </dialog>
    </>
  );
}
