"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTicketReservation } from "@/app/reservations/actions";
import {
  canRequestTicketCancellationOrRefund,
  won,
  type TicketReservation,
  type TicketAction,
} from "@/lib/ticket-reservations";
import { cn } from "@/lib/utils";

const refundReasons = ["개인 사정", "중복 예매", "예매 정보 또는 매수 변경"];
const customRefundReasonOption = "custom";

function getDefaultAdminAction(r: TicketReservation): TicketAction | "" {
  if (r.cancellation_requested_at && r.status !== "cancelled") {
    return "cancelled";
  }
  if (r.status === "cancelled" && r.refund_status === "processing") {
    return "refund_completed";
  }
  return "";
}

export function ReservationControls({
  reservation: r,
  admin = false,
}: {
  reservation: TicketReservation;
  admin?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [copiedRefundAccount, setCopiedRefundAccount] = useState(false);

  // 미입금 즉시 취소가 가능한 상태인지 판별 (입금 대기 중이며 입금 기록/신고가 없는 경우)
  const canChooseUnpaid =
    r.status === "awaiting_payment" &&
    !r.payment_reported_at &&
    r.paid_amount === 0 &&
    r.total_amount > 0;

  // "이미 입금하셨나요?" 질문 응답 상태 (기본값: 유료 예매는 '예, 이미 입금했습니다(환불 신청)')
  const [hasPaid, setHasPaid] = useState<boolean>(r.total_amount > 0);
  const effectiveUnpaid = r.total_amount === 0 ? true : canChooseUnpaid ? !hasPaid : false;
  const savedReason = r.cancellation_reason ?? "";
  const savedPreset = refundReasons.includes(savedReason);
  const [refundReason, setRefundReason] = useState(
    savedPreset ? savedReason : savedReason ? customRefundReasonOption : "",
  );
  const [customRefundReason, setCustomRefundReason] = useState(savedPreset ? "" : savedReason);

  const [action, setAction] = useState<TicketAction | "">(() =>
    getDefaultAdminAction(r),
  );

  const run = async (
    next: TicketAction,
    payload: Record<string, string | number | boolean> = {},
  ) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setMessage("");
    setIsError(false);
    try {
      const result = await updateTicketReservation(
        r.id,
        r.version,
        next,
        payload,
      );
      if (result.ok) {
        if (next === "cancel_requested") dialogRef.current?.close();
        setIsError(false);
        setMessage(
          next === "cancel_requested"
            ? effectiveUnpaid
              ? "예매가 취소되었습니다."
              : "환불 신청이 접수되었습니다. 운영진이 확인 후 처리합니다."
            : "처리가 완료되었습니다.",
        );
        router.refresh();
      } else {
        setIsError(true);
        setMessage(result.error);
      }
    } catch {
      setIsError(true);
      setMessage("처리 결과를 확인하지 못했습니다. 새로고침해 주세요.");
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  };

  const cancel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reasonField = effectiveUnpaid || refundReason === customRefundReasonOption ? "reason" : "refundReason";
    void run("cancel_requested", {
      reason: String(form.get(reasonField) ?? "").trim(),
      unpaid: effectiveUnpaid,
      bank: String(form.get("bank") ?? ""),
      account_number: String(form.get("number") ?? "").replace(/[-\s]/g, ""),
      holder: String(form.get("holder") ?? ""),
    });
  };

  const copyRefundAccount = async () => {
    if (!r.refund_account) return;
    try {
      await navigator.clipboard.writeText(
        `${r.refund_bank ?? ""} ${r.refund_account} (${r.refund_holder ?? ""})`.trim(),
      );
      setCopiedRefundAccount(true);
    } catch {
      setCopiedRefundAccount(false);
    }
  };

  const canRequestCancelOrRefund = !admin && canRequestTicketCancellationOrRefund(r);
  const cancellationLabel = canChooseUnpaid
    ? "예매 취소·환불 신청"
    : r.total_amount === 0
      ? "예매 취소"
      : r.status === "cancelled"
        ? "환불 계좌 등록"
        : "환불 신청";
  const cancellationSubmitLabel = effectiveUnpaid && canChooseUnpaid
    ? "예매 즉시 취소"
    : canChooseUnpaid
      ? "환불 신청"
      : cancellationLabel;
  const dialogId = `reservation-cancellation-${r.id}`;

  if (!admin && !canRequestCancelOrRefund && !message) return null;

  return (
    <div className="space-y-4">
      {canRequestCancelOrRefund && (
        <>
          <Button
            type="button"
            variant="outline"
            aria-haspopup="dialog"
            aria-controls={dialogId}
            disabled={pending}
            onClick={() => {
              if (submittingRef.current) return;
              setMessage("");
              setIsError(false);
              dialogRef.current?.showModal();
            }}
          >
            {cancellationLabel}
          </Button>

          <dialog
            id={dialogId}
            ref={dialogRef}
            aria-labelledby={`${dialogId}-title`}
            aria-busy={pending}
            onCancel={(event) => {
              if (submittingRef.current) event.preventDefault();
            }}
            className="ticket-dialog max-w-md rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:p-6"
          >
            <h2 id={`${dialogId}-title`} className="mb-4 text-lg font-semibold">{cancellationLabel}</h2>
            <form onSubmit={cancel} className="space-y-4">
              {canChooseUnpaid && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">이미 입금하셨나요?</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="payment"
                        checked={hasPaid}
                        onChange={() => setHasPaid(true)}
                        disabled={pending}
                        className="accent-primary"
                      />
                      입금했습니다
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="payment"
                        checked={!hasPaid}
                        onChange={() => setHasPaid(false)}
                        disabled={pending}
                        className="accent-primary"
                      />
                      아직 입금 전입니다
                    </label>
                  </div>
                </fieldset>
              )}

              {/* 입금 완료 시: 환불 계좌 입력 */}
              {!effectiveUnpaid && r.total_amount > 0 && (
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-medium">
                    환불 계좌
                  </legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`bank-${r.id}`} className="text-xs">
                        환불 은행명
                      </Label>
                      <Input
                        id={`bank-${r.id}`}
                        name="bank"
                        aria-label="환불 은행"
                        placeholder="예: 카카오뱅크, 신한은행"
                        defaultValue={r.refund_bank ?? ""}
                        disabled={pending}
                        required
                        maxLength={80}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`holder-${r.id}`} className="text-xs">
                        환불 계좌 예금주
                      </Label>
                      <Input
                        id={`holder-${r.id}`}
                        name="holder"
                        aria-label="환불 계좌 예금주"
                        placeholder="예금주 실명"
                        defaultValue={r.refund_holder ?? r.buyer_name}
                        disabled={pending}
                        required
                        maxLength={80}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`number-${r.id}`} className="text-xs">
                      환불 계좌번호 (숫자만 입력)
                    </Label>
                    <Input
                      id={`number-${r.id}`}
                      name="number"
                      aria-label="환불 계좌번호"
                      placeholder="하이픈(-) 없이 계좌번호 입력"
                      defaultValue={r.refund_account ?? ""}
                      disabled={pending}
                      inputMode="numeric"
                      required
                      maxLength={40}
                    />
                  </div>
                </fieldset>
              )}

              {effectiveUnpaid ? (
                <div className="space-y-2">
                  <Label htmlFor={`reason-${r.id}`}>취소 사유 *</Label>
                  <Input
                    id={`reason-${r.id}`}
                    name="reason"
                    placeholder="예: 일정 변경, 인원수 변경 재예매 등"
                    defaultValue={savedReason}
                    disabled={pending}
                    required
                    maxLength={1000}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor={`refund-reason-${r.id}`}>환불 사유 *</Label>
                  <select
                    id={`refund-reason-${r.id}`}
                    name="refundReason"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm"
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    disabled={pending}
                    required
                  >
                    <option value="" disabled>사유 선택</option>
                    {refundReasons.map((reason) => <option key={reason}>{reason}</option>)}
                    <option value={customRefundReasonOption}>직접 입력</option>
                  </select>
                  {refundReason === customRefundReasonOption && (
                    <Input
                      name="reason"
                      aria-label="환불 사유 직접 입력"
                      placeholder="환불 사유를 입력해 주세요"
                      value={customRefundReason}
                      onChange={(event) => setCustomRefundReason(event.target.value)}
                      disabled={pending}
                      required
                      maxLength={1000}
                    />
                  )}
                </div>
              )}

              {!effectiveUnpaid && (
                <p id={`${dialogId}-consent`} className="text-sm leading-relaxed text-muted-foreground">
                  이 요청을 제출하면 환불 처리에 필요한 은행명, 계좌번호, 예금주, 신청 사유의 수집·이용에 동의합니다.
                </p>
              )}
              {isError && message && (
                <p role="alert" className="break-words rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {message}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => dialogRef.current?.close()}
                >
                  닫기
                </Button>
                <Button
                  type="submit"
                  variant={effectiveUnpaid ? "destructive" : "default"}
                  disabled={pending}
                  aria-describedby={effectiveUnpaid ? undefined : `${dialogId}-consent`}
                >
                  {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                  {pending ? "처리 중…" : cancellationSubmitLabel}
                </Button>
              </div>
            </form>
          </dialog>
        </>
      )}

      {admin && (
        <form
          className="space-y-4 rounded-2xl border border-border/70 bg-muted/15 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!action) return;
            const form = new FormData(e.currentTarget);
            if (
              !window.confirm(
                "실제 입금·반환 및 예매 상태를 확인하셨나요? 선택한 처리를 기록합니다.",
              )
            ) {
              return;
            }
            void run(action, {
              amount: Number(form.get("amount") ?? r.total_amount),
              reference: String(form.get("reference") ?? ""),
              reason: String(form.get("reason") ?? ""),
            });
          }}
        >
          {/* 환불 신청 건일 경우 환불 계좌 및 사유 하이라이트 */}
          {(r.cancellation_requested_at || r.refund_account) && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">예매자 환불 신청 정보</p>
                {r.refund_account && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyRefundAccount()}
                    className="h-7 gap-1 border-amber-500/30 bg-background px-2.5 text-[11px] font-semibold text-foreground"
                  >
                    {copiedRefundAccount ? (
                      <Check className="size-3 text-emerald-600" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>{copiedRefundAccount ? "복사됨" : "환불계좌 복사"}</span>
                  </Button>
                )}
              </div>
              {r.refund_account && (
                <p className="break-all font-mono text-sm font-bold text-foreground">
                  {r.refund_bank} {r.refund_account} · 예금주 {r.refund_holder}
                </p>
              )}
              {r.cancellation_reason && (
                <p className="break-words text-xs">
                  신청 사유: <span className="font-semibold">{r.cancellation_reason}</span>
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`review-${r.id}`} className="text-xs font-bold">
              관리자 처리 작업 선택
            </Label>
            <select
              id={`review-${r.id}`}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={action}
              onChange={(e) => setAction(e.target.value as TicketAction | "")}
            >
              <option value="" disabled>처리 작업 선택</option>
              <option value="cancelled">
                예매 취소 처리
              </option>
              <option value="refund_completed">
                환불 완료 처리
              </option>
              <option value="cancel_rejected">
                환불/취소 요청 반려
              </option>
            </select>
          </div>

          {(action === "cancelled" || action === "cancel_rejected") && (
            <div className="space-y-1.5">
              <Label htmlFor={`admin-reason-${r.id}`} className="text-xs">
                운영자 처리 사유 *
              </Label>
              <Input
                id={`admin-reason-${r.id}`}
                name="reason"
                aria-label="운영자 처리 사유"
                defaultValue={
                  action === "cancelled" && r.cancellation_reason
                    ? `환불 신청 승인 (${r.cancellation_reason})`
                    : ""
                }
                placeholder="처리 사유 입력 (필수)"
                required
                maxLength={1000}
              />
            </div>
          )}

          {r.refund_status === "processing" && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
              확정 환불액 <strong>{won(r.refund_amount)}</strong> · 실제 계좌로 반환 이체한 뒤 &apos;실제 환불 이체 완료 기록&apos;을 실행해 주세요.
            </p>
          )}

          <Button
            disabled={pending || !action}
            type="submit"
            className="h-10 w-full gap-2 font-bold"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            <span>{pending ? "처리 중…" : "선택한 작업 기록하기"}</span>
          </Button>
        </form>
      )}

      {message && (admin || !isError) && (
        <p
          role={isError ? "alert" : "status"}
          className={cn(
            "rounded-xl border p-3.5 text-xs font-semibold",
            isError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
