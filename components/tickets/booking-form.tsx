"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldDescription } from "@/components/ui/field-description";
import {
  LeaveConfirmDialog,
  useUnsavedChangesWarning,
} from "@/components/ui/leave-confirm-dialog";
import { createTicketReservation } from "@/app/reservations/actions";
import { TICKET_RESERVATION_PRIVACY_EXCERPT } from "@/lib/legal-documents";
import { won, type TicketOffer } from "@/lib/ticket-reservations";

export function BookingForm({ offer }: { offer: TicketOffer }) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sameDepositor, setSameDepositor] = useState(true);
  const [depositor, setDepositor] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [review, setReview] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const count = Number(quantity);
  const price = offer.unit_price ?? 0;
  const valid =
    Number.isSafeInteger(count) && count > 0 && count <= offer.remaining;
  const payer = sameDepositor ? name : depositor;

  const isDirty = Boolean(
    name.trim() ||
      phone.trim() ||
      (!sameDepositor && depositor.trim()) ||
      review,
  );

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    markSubmitting,
  } = useUnsavedChangesWarning({
    isDirty,
    defaultBackLink: `/gigs/${offer.gig_id}`,
  });

  const adjustQuantity = (delta: number) => {
    const base = Number.isSafeInteger(count) && count >= 1 ? count : 1;
    const next = Math.min(offer.remaining, Math.max(1, base + delta));
    setQuantity(String(next));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (
      !valid ||
      !name.trim() ||
      !/^01[016789][0-9]{7,8}$/.test(phone.replace(/[-\s]/g, "")) ||
      !payer.trim()
    ) {
      setError("이름·전화번호·입금자명·수량을 확인해 주세요.");
      return;
    }
    if (!review) {
      setReview(true);
      return;
    }
    if (!privacy || !policy) {
      setError("필수 안내를 확인하고 동의해 주세요.");
      return;
    }
    setPending(true);
    try {
      const result = await createTicketReservation({
        gigId: offer.gig_id,
        key,
        name,
        phone,
        depositor: payer,
        quantity: count,
        offerHash: offer.offer_hash,
        privacyAgreed: privacy,
        policyAgreed: policy,
      });
      if (result.ok) {
        markSubmitting();
        router.push(`/reservations/${result.id}`);
        router.refresh();
      } else {
        setError(result.error);
        setPending(false);
      }
    } catch {
      setError(
        "예매 결과를 확인하지 못했습니다. 같은 화면에서 다시 시도해 주세요.",
      );
      setPending(false);
    }
  };

  return (
    <>
      <form
        onSubmit={submit}
        className="min-w-0 space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-4">
          <h2 className="text-lg font-semibold">{review ? "예매 내용 확인" : "예매자 정보"}</h2>
          <span className="text-sm text-muted-foreground">{review ? "2 / 2" : "1 / 2"} 단계</span>
        </div>

        {review ? (
          <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">예매자</dt>
            <dd className="break-words">{name}</dd>
            <dt className="text-muted-foreground">전화번호</dt>
            <dd className="break-words tabular-nums">{phone}</dd>
            {price > 0 && (
              <>
                <dt className="text-muted-foreground">입금자명</dt>
                <dd className="break-words">{payer}</dd>
                <dt className="text-muted-foreground">1매 가격</dt>
                <dd className="tabular-nums">{won(price)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">예매 수량</dt>
            <dd className="tabular-nums">{count}매</dd>
            <dt className="text-muted-foreground">총 예매 금액</dt>
            <dd className="font-semibold tabular-nums">{won(price * count)}</dd>
          </dl>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="buyer-name">예매자 이름 *</Label>
              <Input
                id="buyer-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                placeholder="이름을 입력해주세요"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer-phone">전화번호 *</Label>
              <Input
                id="buyer-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={20}
                placeholder="010-0000-0000"
              />
              <FieldDescription>
                예매 확인 및 현장 입장 안내 연락에 사용됩니다.
              </FieldDescription>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket-quantity">예매 수량 *</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="수량 1매 줄이기"
                  disabled={count <= 1}
                  onClick={() => adjustQuantity(-1)}
                  className="shrink-0"
                >
                  <Minus className="size-4" />
                </Button>
                <Input
                  id="ticket-quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={offer.remaining}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="w-16 text-center font-semibold tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="수량 1매 늘리기"
                  disabled={count >= offer.remaining}
                  onClick={() => adjustQuantity(1)}
                  className="shrink-0"
                >
                  <Plus className="size-4" />
                </Button>
                <span className="text-sm font-semibold tabular-nums">
                  {valid ? won(count * price) : "—"}
                </span>
              </div>
              <FieldDescription>
                잔여 {offer.remaining.toLocaleString()}매
              </FieldDescription>
            </div>

            {price > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2.5">
                  <Checkbox
                    id="same-depositor"
                    checked={sameDepositor}
                    onCheckedChange={(checked) => setSameDepositor(Boolean(checked))}
                  />
                  <Label
                    htmlFor="same-depositor"
                    className="cursor-pointer text-sm font-medium text-foreground"
                  >
                    입금자명이 예매자와 같아요
                  </Label>
                </div>
                {!sameDepositor && (
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="depositor">입금자명 *</Label>
                    <Input
                      id="depositor"
                      value={depositor}
                      onChange={(e) => setDepositor(e.target.value)}
                      required
                      maxLength={80}
                      placeholder="실제 계좌 송금 시 표시되는 입금자 이름"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {review && (
          <div className="space-y-3 border-t pt-4">
            <section className="overflow-hidden rounded-xl border border-border/70">
              <div className="flex items-center gap-2 p-4">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm font-semibold leading-relaxed">
                  <Checkbox
                    checked={privacy}
                    disabled={pending}
                    onCheckedChange={(checked) => setPrivacy(checked === true)}
                  />
                  <span className="break-keep">
                    <span className="mr-1.5 text-xs font-medium text-muted-foreground">
                      [필수]
                    </span>
                    예매 개인정보 수집·이용에 동의합니다.
                  </span>
                </label>
                <button
                  type="button"
                  aria-expanded={privacyExpanded}
                  aria-controls="booking-privacy-excerpt"
                  className="shrink-0 rounded-sm py-1 text-xs font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setPrivacyExpanded((current) => !current)}
                >
                  상세보기
                </button>
              </div>
              <div
                id="booking-privacy-excerpt"
                hidden={!privacyExpanded}
                className="space-y-2 border-t border-border/50 bg-muted/20 p-4 text-xs leading-6 text-muted-foreground"
              >
                <p className="whitespace-pre-wrap break-words">
                  {TICKET_RESERVATION_PRIVACY_EXCERPT}
                </p>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-border/70">
              <div className="flex items-center gap-2 p-4">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm font-semibold leading-relaxed">
                  <Checkbox
                    checked={policy}
                    disabled={pending}
                    onCheckedChange={(checked) => setPolicy(checked === true)}
                  />
                  <span className="break-keep">
                    <span className="mr-1.5 text-xs font-medium text-muted-foreground">
                      [필수]
                    </span>
                    {offer.notice
                      ? "예매 내용과 공연 유의사항을 확인했습니다."
                      : "예매 내용을 확인했습니다."}
                  </span>
                </label>
              </div>
            </section>

            {price > 0 && (
              <p className="text-sm text-muted-foreground">
                신청 후 입금 계좌를 안내해 드립니다. 입금 확인 후 예매가 확정됩니다.
              </p>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            <p className="font-medium">{error}</p>
            <button
              type="button"
              className="text-xs font-semibold underline underline-offset-4"
              onClick={() => router.refresh()}
            >
              현재 판매 정보 새로고침
            </button>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {review && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReview(false);
                setPrivacy(false);
                setPolicy(false);
                setPrivacyExpanded(false);
              }}
              disabled={pending}
            >
              <ArrowLeft className="size-4" />
              정보 수정
            </Button>
          )}
          <Button
            disabled={pending || !valid || (review && (!privacy || !policy))}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "접수 중…" : review ? "예매 신청" : "다음으로"}
            {!review && <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </form>

      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
      />
    </>
  );
}
