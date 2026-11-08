import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PositiveStatusIcon } from "@/components/ui/status-icons";
import {
  ticketStatus,
  ticketStatusTone,
  type TicketReservation,
  type TicketStatusTarget,
} from "@/lib/ticket-reservations";
import { cn } from "@/lib/utils";

export function TicketStatusBadge({
  reservation,
  includeAdmission = false,
  className,
}: {
  reservation: TicketStatusTarget;
  includeAdmission?: boolean;
  className?: string;
}) {
  const label = ticketStatus(reservation, includeAdmission);
  const tone = ticketStatusTone(reservation);
  const Icon = tone === "positive" ? PositiveStatusIcon : tone === "warning" ? Clock : null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 shrink-0 gap-1 rounded-lg px-2.5 text-[11px] font-bold shadow-none",
        tone === "positive" &&
          "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        tone === "warning" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </Badge>
  );
}

const BOOKING_STEPS = [
  { step: 1, title: "예매자 예매 신청", description: "수량 및 필수 동의 접수" },
  { step: 2, title: "계좌 입금", description: "안내 계좌로 예매 금액 송금" },
  { step: 3, title: "관리자 입금 확인·확정", description: "운영진 수동 대조 및 승인" },
] as const;

export function TicketProgressStepper({
  reservation: r,
}: {
  reservation: Pick<
    TicketReservation,
    | "status"
    | "refund_status"
    | "cancellation_requested_at"
    | "payment_reported_at"
    | "paid_amount"
    | "total_amount"
  >;
}) {
  const isCancelledOrRefund =
    r.status === "cancelled" ||
    Boolean(r.cancellation_requested_at) ||
    r.refund_status !== "none";

  if (isCancelledOrRefund) {
    return null;
  }

  const isApproved = r.status === "approved";
  const hasDepositActivity = Boolean(r.payment_reported_at) || r.paid_amount > 0;

  const getStepState = (step: number): "done" | "current" | "upcoming" => {
    if (isApproved) return "done";
    if (step === 1) return "done";
    if (step === 2) return hasDepositActivity ? "done" : "current";
    if (step === 3) return hasDepositActivity ? "current" : "upcoming";
    return "upcoming";
  };

  return (
    <section
      aria-label="예매 진행 단계"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-black tracking-wider text-muted-foreground uppercase">
          예매 진행 단계
        </h2>
        <span className="text-[11px] font-semibold text-muted-foreground">
          {isApproved
            ? "예매 확정 완료"
            : "계좌 입금 후 관리자가 확인하면 예매가 확정됩니다"}
        </span>
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
        {BOOKING_STEPS.map(({ step, title, description }) => {
          const state = getStepState(step);
          return (
            <li
              key={step}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 transition-colors sm:flex-col sm:gap-1.5",
                state === "done" &&
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
                state === "current" &&
                  "border-primary/40 bg-primary/5 text-foreground ring-1 ring-primary/20",
                state === "upcoming" &&
                  "border-border/60 bg-muted/30 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                  state === "done" &&
                    "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-emerald-950",
                  state === "current" &&
                    "bg-primary text-primary-foreground",
                  state === "upcoming" &&
                    "bg-muted text-muted-foreground border border-border",
                )}
              >
                {state === "done" ? (
                  <PositiveStatusIcon className="size-3" aria-hidden="true" />
                ) : (
                  step
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-xs font-bold leading-snug",
                    state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {title}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
