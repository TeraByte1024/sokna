"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTicketPaymentAccount, won, type TicketReservation } from "@/lib/ticket-reservations";

export function PaymentInstructions({
  reservation: r,
}: {
  reservation: TicketReservation;
}) {
  const [copiedTarget, setCopiedTarget] = useState<"account" | "all" | null>(
    null,
  );
  const a = getTicketPaymentAccount(r);
  if (!a) return null;

  const awaitingReview = Boolean(r.payment_reported_at) || r.paid_amount > 0;
  const amountLabel = awaitingReview ? "총 예매 금액" : "입금할 금액";

  const copy = async (all: boolean) => {
    try {
      await navigator.clipboard.writeText(
        all
          ? `${a.bank} ${a.account_number}\n예금주 ${a.holder}\n${amountLabel} ${won(r.total_amount)}\n입금자명 ${r.depositor}`
          : a.account_number,
      );
      setCopiedTarget(all ? "all" : "account");
      toast.success(
        all
          ? "입금 안내 전체 내용을 복사했습니다."
          : "계좌번호를 복사했습니다.",
      );
    } catch {
      setCopiedTarget(null);
      toast.error(
        "복사하지 못했습니다. 표시된 계좌번호를 직접 복사해 주세요.",
      );
    }
  };

  return (
    <Card className="space-y-4 p-4 shadow-sm sm:p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">입금 안내</h2>
        <p className="text-sm text-muted-foreground">
          {awaitingReview
            ? "이미 입금했다면 다시 송금하지 마세요. 입금액이 다르면 운영진에게 문의해 주세요."
            : "아래 계좌로 입금해 주세요. 입금 확인 후 예매가 확정됩니다."}
        </p>
      </div>

      <div className="space-y-1">
        <p className="break-words text-sm">{a.bank} <strong className="font-mono font-semibold">{a.account_number}</strong></p>
        <p className="break-words text-sm text-muted-foreground">예금주 {a.holder}</p>
      </div>

      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-2 border-t pt-3 text-sm">
        <dt className="text-muted-foreground">{amountLabel}</dt>
        <dd className="font-semibold tabular-nums">{won(r.total_amount)}</dd>
        <dt className="text-muted-foreground">입금자명</dt>
        <dd className="break-words">{r.depositor}</dd>
      </dl>

      {a.instruction && !awaitingReview && (
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {a.instruction}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy(false)}>
          {copiedTarget === "account" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          계좌번호 복사
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy(true)}
        >
          {copiedTarget === "all" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          입금 안내 전체 복사
        </Button>
      </div>
    </Card>
  );
}
