"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { updateTicketReservation } from "@/app/reservations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { won, type TicketReservation } from "@/lib/ticket-reservations";

export function AdminReservationQuantityDialog({
  reservation,
  action,
  disabled = false,
  triggerClassName,
  onUpdated,
}: {
  reservation: TicketReservation;
  action: "check_in" | "quantity_updated";
  disabled?: boolean;
  triggerClassName?: string;
  onUpdated?: (reservation: TicketReservation | null) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const checkIn = action === "check_in";
  const { quantity, admitted_quantity: admitted, unit_price: price, paid_amount: paid } = reservation;
  const remaining = quantity - admitted;
  const min = checkIn ? 1 : Math.max(1, admitted);
  const max = checkIn ? remaining : 1000000;
  const label = checkIn ? "입장 확인" : "매수 수정";
  const unitLabel = checkIn ? "인원" : "매수";
  const count = Number(value);
  const valid = Number.isInteger(count) && count >= min && count <= max;
  const newTotal = count * price;
  const unchanged = !checkIn && count === quantity;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || unchanged || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const result = await updateTicketReservation(reservation.id, reservation.version, action, { quantity: count }, Boolean(onUpdated));
      if (result.ok) {
        dialog.current?.close();
        onUpdated?.(result.reservation ?? null);
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("처리 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-haspopup="dialog"
        aria-controls={id}
        className={triggerClassName}
        disabled={disabled || pending}
        onClick={() => {
          setValue(String(checkIn ? remaining : quantity));
          setError("");
          dialog.current?.showModal();
        }}
      >
        {label}
      </Button>
      <dialog
        id={id}
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => { if (submitting.current) event.preventDefault(); }}
        className="ticket-dialog max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl backdrop:bg-black/60"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <h2 id={`${id}-title`} className="text-lg font-semibold">{label}</h2>
            <p id={`${id}-description`} className="text-sm text-muted-foreground">
              {reservation.buyer_name} · {checkIn ? `입장 ${admitted}/${quantity}명 · 남은 ${remaining}명` : `현재 ${quantity}매`}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-quantity`}>{checkIn ? "이번에 입장할 인원" : "변경할 예매 매수"}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label={`${unitLabel} 줄이기`}
                disabled={pending || count <= min}
                onClick={() => setValue(String(Math.min(max, Math.max(min, count - 1))))}
              >
                <ChevronDown aria-hidden="true" />
              </Button>
              <Input
                id={`${id}-quantity`}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step={1}
                required
                autoFocus
                disabled={pending}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="h-11 text-center text-base tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label={`${unitLabel} 늘리기`}
                disabled={pending || count >= max}
                onClick={() => setValue(String(Math.min(max, Math.max(min, count + 1))))}
              >
                <ChevronUp aria-hidden="true" />
              </Button>
            </div>
            {!checkIn && admitted > 0 && (
              <p className="text-xs text-muted-foreground">이미 입장한 {admitted}명 이상으로 설정할 수 있습니다.</p>
            )}
          </div>
          {!checkIn && valid && (
            <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
              <p>변경 후 총액 <strong>{won(newTotal)}</strong></p>
              {paid > 0 && <p className="text-muted-foreground">기록된 입금액 {won(paid)}</p>}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => dialog.current?.close()}>
              닫기
            </Button>
            <Button type="submit" disabled={pending || !valid || unchanged}>
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {checkIn ? "입장 처리" : "저장"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
