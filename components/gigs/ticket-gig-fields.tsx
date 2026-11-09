"use client";

import { Clock } from "lucide-react";
import { GigDateTimeInputs } from "@/components/gigs/gig-date-time-inputs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultBookingDeadline, bookingDeadlineInput, type TicketBookingMode } from "@/lib/ticket-reservations";
import type { TicketGigFields } from "@/lib/ticket-database";

export type TicketGigForm = {
  admissionStartTime: string;
  notice: string;
  mode: TicketBookingMode | null;
  enabled: boolean;
  capacity: string;
  startsAt: string;
  deadline: string;
  refundPolicy: string;
};

export function initialTicketGigForm(gig?: TicketGigFields): TicketGigForm {
  return {
    admissionStartTime: bookingDeadlineInput(gig?.admission_starts_at).slice(11),
    notice: gig?.notice ?? "",
    mode: !gig || gig.ticket_booking_enabled === false || gig.ticket_booking_mode === "manual"
      ? "manual"
      : gig.ticket_booking_mode === "scheduled" ? "scheduled" : null,
    enabled: gig?.ticket_booking_enabled ?? true,
    capacity: gig?.ticket_capacity?.toString() ?? "",
    startsAt: bookingDeadlineInput(gig?.advance_booking_starts_at),
    deadline: bookingDeadlineInput(gig?.advance_booking_deadline),
    refundPolicy: gig?.ticket_refund_policy ?? "",
  };
}

export function TicketGigFields({
  value,
  onChange,
  performDate,
  advanceTicketPrice,
  onAdvanceTicketPriceChange,
}: {
  value: TicketGigForm;
  onChange: (value: TicketGigForm) => void;
  performDate: string;
  advanceTicketPrice?: number | null;
  onAdvanceTicketPriceChange?: (price: number | null) => void;
}) {
  const set = <K extends keyof TicketGigForm>(key: K, next: TicketGigForm[K]) =>
    onChange({ ...value, [key]: next });
  const scheduled = value.mode !== "manual";
  const enabled = scheduled || value.enabled;
  const [startDate, startTime = ""] = value.startsAt.split("T");
  const [endDate, endTime = ""] = (value.deadline || defaultBookingDeadline(performDate)).split("T");
  const setDateTime = (key: "startsAt" | "deadline", date: string, time: string) =>
    set(key, date || time ? `${date}T${time}` : "");

  return (
    <section className="space-y-5 border-t border-border/60 pt-5">
      <div className="space-y-1.5">
        <Label htmlFor="gig-notice" className="text-xs font-semibold text-foreground">
          공연 유의사항
        </Label>
        <textarea
          id="gig-notice"
          value={value.notice}
          onChange={(e) => set("notice", e.target.value)}
          maxLength={10000}
          rows={5}
          placeholder="반입 제한, 촬영 및 관람 안내 등을 입력해 주세요."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">사전예매 운영 방식</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background p-3 has-[:checked]:border-primary/50 has-[:checked]:bg-muted/50">
              <input
                type="radio"
                name="ticket-booking-mode-choice"
                checked={!scheduled}
                onChange={() => set("mode", "manual")}
                className="mt-0.5 accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold">수동</span>
                <span className="block text-xs text-muted-foreground">공연 시작 전까지 관리자가 직접 켜고 끕니다.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background p-3 has-[:checked]:border-primary/50 has-[:checked]:bg-muted/50">
              <input
                type="radio"
                name="ticket-booking-mode-choice"
                checked={scheduled}
                onChange={() => set("mode", "scheduled")}
                className="mt-0.5 accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-semibold">기간 지정</span>
                <span className="block text-xs text-muted-foreground">설정한 시작·마감 시각에 맞춰 자동으로 열리고 닫힙니다.</span>
              </span>
            </label>
          </div>
        </fieldset>

        {!scheduled && (
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="ticket-booking-enabled"
              checked={value.enabled}
              onCheckedChange={(checked) => set("enabled", Boolean(checked))}
            />
            <Label htmlFor="ticket-booking-enabled" className="cursor-pointer text-xs font-semibold">
              관객 사전예매 받기
            </Label>
          </div>
        )}

        {enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="advance_ticket_price"
                className="text-xs font-semibold text-foreground flex items-center justify-between"
              >
                <span>
                  사전예매 가격 <span className="text-destructive">*</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">KRW (원)</span>
              </Label>
              <div className="relative">
                <Input
                  id="advance_ticket_price"
                  name="advance_ticket_price"
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="예: 5,000"
                  value={
                    advanceTicketPrice != null
                      ? advanceTicketPrice.toLocaleString("ko-KR")
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, "");
                    onAdvanceTicketPriceChange?.(raw ? parseInt(raw, 10) : null);
                  }}
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm h-10 pr-8 font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
                  원
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ticket-capacity" className="text-xs font-semibold text-foreground">
                총 판매 매수 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ticket-capacity"
                type="number"
                min={1}
                max={1000000}
                step={1}
                value={value.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                placeholder="예: 200"
                required
                className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm h-10"
              />
            </div>

            {scheduled && (
              <div className="grid min-w-0 gap-4 sm:col-span-2 md:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="ticket-starts-at_date" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Clock className="size-3.5 text-indigo-500" aria-hidden="true" />
                    사전예매 시작 일시{value.mode === "scheduled" && <span className="text-destructive">*</span>}
                  </Label>
                  <GigDateTimeInputs
                    id="ticket-starts-at"
                    timeLabel="사전예매 시작 시간"
                    date={startDate}
                    time={startTime}
                    onDateChange={(date) => setDateTime("startsAt", date, startTime)}
                    onTimeChange={(time) => setDateTime("startsAt", startDate, time)}
                    dateRequired={value.mode === "scheduled" || Boolean(startTime)}
                    timeRequired={value.mode === "scheduled" || Boolean(startDate)}
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => set("startsAt", bookingDeadlineInput(new Date().toISOString()))}
                    >
                      현재 시각으로 설정
                    </button>
                    {value.mode === null && value.startsAt && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => set("startsAt", "")}
                      >
                        시작 제한 해제 (즉시 오픈)
                      </button>
                    )}
                  </div>
                </div>

                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="ticket-deadline_date" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Clock className="size-3.5 text-indigo-500" aria-hidden="true" />
                    사전예매 마감 일시 <span className="text-destructive">*</span>
                  </Label>
                  <GigDateTimeInputs
                    id="ticket-deadline"
                    timeLabel="사전예매 마감 시간"
                    date={endDate}
                    time={endTime}
                    onDateChange={(date) => setDateTime("deadline", date, endTime)}
                    onTimeChange={(time) => setDateTime("deadline", endDate, time)}
                    dateRequired
                    timeRequired
                  />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => set("deadline", "")}
                  >
                    공연 전날 23:59로 설정
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
