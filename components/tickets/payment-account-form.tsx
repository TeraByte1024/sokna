"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePaymentAccount } from "@/app/reservations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentAccount } from "@/lib/ticket-reservations";

export function PaymentAccountForm({ current }: { current: PaymentAccount | null }) {
  const router = useRouter();
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [value, setValue] = useState({
    bank: current?.bank ?? "",
    number: current?.account_number ?? "",
    holder: current?.holder ?? "",
    instruction: current?.instruction ?? "",
  });

  return (
    <form
      className="space-y-5 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage("");
        if (!review) {
          setReview(true);
          return;
        }
        setPending(true);
        try {
          const result = await savePaymentAccount(value);
          if (result.ok) {
            setMessage("새 예매에 사용할 납부 계좌를 저장했습니다.");
            setReview(false);
            router.refresh();
          } else {
            setMessage(result.error);
          }
        } catch {
          setMessage("계좌를 저장하지 못했습니다. 다시 시도해 주세요.");
        } finally {
          setPending(false);
        }
      }}
    >
      {review ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h2 className="text-base font-semibold">납부 계좌 최종 확인</h2>
          <p className="break-all font-mono text-lg font-bold">
            {value.bank} {value.number}
          </p>
          <p className="text-sm font-medium">예금주: {value.holder}</p>
          {value.instruction && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{value.instruction}</p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            저장 후 접수되는 새 예매에 적용합니다. 이미 접수된 예매의 계좌 스냅샷은 바뀌지 않습니다. 실제 계좌 유효성은 운영자가 확인해 주세요.
          </p>
        </div>
      ) : (
        <>
          {(
            [
              ["bank", "은행명"],
              ["number", "계좌번호"],
              ["holder", "예금주"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`account-${key}`}>{label}</Label>
              <Input
                id={`account-${key}`}
                value={value[key]}
                onChange={(e) => setValue({ ...value, [key]: e.target.value })}
                maxLength={key === "number" ? 40 : 80}
                required
                inputMode={key === "number" ? "numeric" : "text"}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="account-instruction">추가 입금 안내 (선택)</Label>
            <Textarea
              id="account-instruction"
              value={value.instruction}
              onChange={(e) => setValue({ ...value, instruction: e.target.value })}
              rows={4}
              maxLength={2000}
              placeholder="예: 입금자명에 예매자 성함을 정확히 입력해 주세요."
            />
          </div>
        </>
      )}

      <div className="flex gap-3">
        {review && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setReview(false)}
          >
            다시 입력
          </Button>
        )}
        <Button disabled={pending}>
          {pending ? "저장 중…" : review ? "확인 후 계좌 저장" : "계좌 정보 확인"}
        </Button>
      </div>

      {message && (
        <p role="status" className="rounded-lg bg-muted/60 px-3 py-2 text-sm font-medium">
          {message}
        </p>
      )}
    </form>
  );
}
