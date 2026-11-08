"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2 } from "lucide-react";
import { updateTicketReservation } from "@/app/reservations/actions";
import { AdminReservationQuantityDialog } from "@/components/tickets/admin-reservation-quantity-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { canCheckInTicketReservation, canEditTicketQuantity, type TicketReservation } from "@/lib/ticket-reservations";
import { cn } from "@/lib/utils";

const stageActions = {
  approved: { label: "입금 확인", success: "입금 확인이 완료되었습니다." },
  revoke_approval: { label: "입금 확인 취소", success: "입금 확인을 취소했습니다." },
  undo_check_in: { label: "입장 전체 취소", success: "입장 확인을 취소했습니다." },
};

export function AdminReservationStageActions({
  reservation: r,
  compact = false,
  confirmPayment = false,
  disabled = false,
  onUpdated,
}: {
  reservation: TicketReservation;
  compact?: boolean;
  confirmPayment?: boolean;
  disabled?: boolean;
  onUpdated?: (reservation: TicketReservation | null) => void;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState<keyof typeof stageActions | null>(null);

  async function run(action: keyof typeof stageActions) {
    if (disabled || submitting.current) return;
    if (action === "approved" && confirmPayment && !window.confirm("실제 입금을 확인하셨나요?")) return;
    submitting.current = true;
    setPending(action);
    try {
      const result = await updateTicketReservation(r.id, r.version, action, {}, Boolean(onUpdated));
      if (result.ok) {
        onUpdated?.(result.reservation ?? null);
        toast.success(stageActions[action].success);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("처리에 실패했습니다. 새로고침 후 다시 시도해 주세요.");
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  function actionButton(action: keyof typeof stageActions) {
    const payment = action === "approved";
    return (
      <Button
        type="button"
        size="sm"
        variant={payment ? "default" : "outline"}
        disabled={disabled || pending !== null}
        onClick={() => void run(action)}
        className={cn(
          compact && "h-7 px-2.5",
          payment && "bg-sky-600 font-bold text-white hover:bg-sky-700 dark:hover:bg-sky-500",
        )}
      >
        {pending === action ? <Loader2 className="animate-spin" aria-hidden="true" /> : payment && <Banknote aria-hidden="true" />}
        {stageActions[action].label}
      </Button>
    );
  }

  if (!canEditTicketQuantity(r)) return null;
  if (r.status === "awaiting_payment") return actionButton("approved");

  const canCheckIn = canCheckInTicketReservation(r);
  return (
    <>
      {canCheckIn && (
        <AdminReservationQuantityDialog
          reservation={r}
          action="check_in"
          onUpdated={onUpdated}
          disabled={disabled || pending !== null}
          triggerClassName={cn(
            compact && "h-7 px-2.5",
            "border-transparent bg-emerald-600 font-bold text-white hover:bg-emerald-700 hover:text-white dark:hover:bg-emerald-500",
          )}
        />
      )}
      {r.admitted_quantity > 0 && (canCheckIn || !compact) && actionButton("undo_check_in")}
      {!compact && actionButton("revoke_approval")}
    </>
  );
}
