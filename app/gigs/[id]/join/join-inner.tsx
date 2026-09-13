"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Gig, type GigRsvp, type GigRsvpStatus } from "@/lib/gig";
import { submitGigRsvp } from "@/app/gigs/actions";
import { LeaveConfirmDialog, useUnsavedChangesWarning } from "@/components/ui/leave-confirm-dialog";
import { getDDay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  Clock,
  MapPin,
  Music,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  Check,
  Loader2,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface JoinInnerProps {
  gig: Gig;
  existingRsvp: GigRsvp | null;
  defaultPart: string;
  userName: string;
}

const COMMON_PARTS = [
  "보컬",
  "일렉기타",
  "어쿠스틱기타",
  "베이스",
  "드럼",
  "건반",
  "신디사이저",
  "세션",
];

function formatKoreanDate(dateStr: string | null) {
  if (!dateStr) return "일정 미정";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return dateStr;
  }
}

export function JoinInner({
  gig,
  existingRsvp,
  defaultPart,
  userName,
}: JoinInnerProps) {
  const router = useRouter();

  // 폼 상태
  const [status, setStatus] = useState<GigRsvpStatus>(
    existingRsvp?.status ?? "going"
  );
  const [part, setPart] = useState<string>(
    existingRsvp?.part || defaultPart || "세션"
  );
  const [note, setNote] = useState<string>(existingRsvp?.note || "");
  const [pending, setPending] = useState(false);

  const isDirty = useMemo(() => {
    const initStatus = existingRsvp?.status ?? "going";
    const initPart = existingRsvp?.part || defaultPart || "세션";
    const initNote = existingRsvp?.note || "";

    return (
      status !== initStatus ||
      (status === "going" && part !== initPart) ||
      note.trim() !== initNote.trim()
    );
  }, [existingRsvp, defaultPart, status, part, note]);

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    markSubmitting,
  } = useUnsavedChangesWarning({ isDirty, defaultBackLink: `/gigs/${gig.id}` });

  const dDay = getDDay(gig.perform_date);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);

    const formData = new FormData();
    formData.set("gig_id", String(gig.id));
    formData.set("status", status);
    if (status === "going") {
      formData.set("part", part);
    }
    if (note.trim()) {
      formData.set("note", note.trim());
    }

    try {
      const result = await submitGigRsvp(formData);
      if (result.ok) {
        markSubmitting();
        toast.success(
          existingRsvp
            ? "참가 신청 내역이 수정되었습니다."
            : "공연 참가 신청이 완료되었습니다!"
        );
        router.refresh();
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error("신청 처리 중 문제가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto pb-20">
      {/* 1. 상단 내비게이션 */}
      <div className="flex items-center justify-between">
        <Link
          href={`/gigs/${gig.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="size-3.5 group-hover:-translate-x-1 transition-transform" />
          공연 상세 정보 보기
        </Link>
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">{userName}</strong> 님
        </span>
      </div>

      {/* 2. 공연 및 선곡회의 핵심 정보 카드 */}
      <Card className="border-border/70 shadow-sm overflow-hidden bg-gradient-to-br from-card to-muted/20">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-start">
            {gig.poster_url ? (
              <div className="w-24 sm:w-28 aspect-[1/1.414] rounded-xl overflow-hidden border border-border shrink-0 shadow-xs mx-auto sm:mx-0">
                <img
                  src={gig.poster_url}
                  alt={gig.title}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="size-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mx-auto sm:mx-0">
                <Music className="size-8" />
              </div>
            )}

            <div className="space-y-2 flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                {dDay && (
                  <Badge className="bg-primary text-primary-foreground font-black px-2.5 py-0.5 text-xs">
                    {dDay}
                  </Badge>
                )}
                <span className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
                  공연 참가 신청
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                {gig.title}
              </h1>
              <p className="text-xs text-muted-foreground">
                아래 일정과 선곡회의 일시를 확인하시고 이번 무대 참여 여부를 선택해 주세요.
              </p>
            </div>
          </div>

          {/* 공연 일시 & 선곡회의 일시 & 공연 장소 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* 공연 일시 */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-background/80 border border-border/60">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <Calendar className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground font-medium">공연 일시</div>
                <div className="text-xs font-bold text-foreground truncate">
                  {formatKoreanDate(gig.perform_date)}
                </div>
              </div>
            </div>

            {/* 선곡회의 일시 (필수 요청 반영) */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-background/80 border border-border/60">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0">
                <Clock className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground font-medium">선곡 회의 일시</div>
                <div className="text-xs font-bold text-foreground truncate">
                  {gig.meeting_date ? formatKoreanDate(gig.meeting_date) : "추후 공지 예정"}
                </div>
              </div>
            </div>

            {/* 공연 장소 (있을 경우 2열 확장) */}
            {gig.location && (
              <div className="sm:col-span-2 flex items-center gap-3 p-3.5 rounded-xl bg-background/80 border border-border/60">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <MapPin className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground font-medium">공연 장소</div>
                  <div className="text-xs font-bold text-foreground truncate">
                    {gig.location}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. 참여 여부 선택 폼 */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-bold text-foreground">
              참여 여부 선택 <span className="text-destructive">*</span>
            </Label>
            {existingRsvp && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                기존 신청 내역 있음 (수정 가능)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 참여 (Going) */}
            <button
              type="button"
              onClick={() => setStatus("going")}
              className={`p-4 rounded-2xl border text-left transition-all flex flex-col gap-2 relative ${
                status === "going"
                  ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                  : "border-border/70 hover:border-border hover:bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="size-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="size-4" />
                </div>
                {status === "going" && (
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-extrabold text-foreground">참여</div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  무대 세션으로 참여합니다.
                </p>
              </div>
            </button>

            {/* 불참 (Not Going) */}
            <button
              type="button"
              onClick={() => setStatus("not_going")}
              className={`p-4 rounded-2xl border text-left transition-all flex flex-col gap-2 relative ${
                status === "not_going"
                  ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
                  : "border-border/70 hover:border-border hover:bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="size-8 rounded-xl bg-destructive/20 text-destructive flex items-center justify-center">
                  <XCircle className="size-4" />
                </div>
                {status === "not_going" && (
                  <Check className="size-4 text-destructive" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-extrabold text-foreground">불참</div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  이번 공연은 참석이 어렵습니다.
                </p>
              </div>
            </button>

            {/* 미정 (Undecided) */}
            <button
              type="button"
              onClick={() => setStatus("undecided")}
              className={`p-4 rounded-2xl border text-left transition-all flex flex-col gap-2 relative ${
                status === "undecided"
                  ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
                  : "border-border/70 hover:border-border hover:bg-muted/20"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="size-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <HelpCircle className="size-4" />
                </div>
                {status === "undecided" && (
                  <Check className="size-4 text-amber-500" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-extrabold text-foreground">미정</div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  일정을 조율하고 있습니다.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 참여 선택 시 희망 세션 파트 입력 */}
        {status === "going" && (
          <div className="p-5 rounded-2xl border border-border/80 bg-muted/20 space-y-4 animate-in fade-in-0 duration-200">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-foreground">
                희망 세션 파트 <span className="text-destructive">*</span>
              </Label>
              <div className="relative flex items-center max-w-sm">
                <Input
                  type="text"
                  value={part}
                  onChange={(e) => setPart(e.target.value)}
                  placeholder="예: 보컬, 기타, 베이스, 드럼, 건반 등"
                  required
                  className="h-9 text-xs pr-8 bg-background border-border text-foreground"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="absolute right-1 size-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                      title="자주 쓰는 세션 목록"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                      자주 쓰는 세션
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {COMMON_PARTS.map((c) => (
                      <DropdownMenuItem
                        key={c}
                        onClick={() => setPart(c)}
                        className="text-xs cursor-pointer flex items-center justify-between"
                      >
                        <span className={part === c ? "font-semibold text-primary" : ""}>
                          {c}
                        </span>
                        {part === c && <Check className="size-3.5 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-[11px] text-muted-foreground">
                기본값은 회원 계정에 등록된 파트이며, 이번 공연에서 맡고 싶은 파트로 자유롭게 변경 가능합니다.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="note" className="text-xs font-bold text-foreground">
                  전달 사항 / 메모
                </Label>
                <span className="text-[11px] text-muted-foreground">선택 사항</span>
              </div>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 선곡 회의 15분 정도 늦을 수 있습니다, 특정 곡만 세션 희망합니다 등"
                className="h-20 text-xs bg-background border-border text-foreground placeholder:text-muted-foreground/60 resize-none"
              />
            </div>
          </div>
        )}

        {/* 불참 또는 미정 선택 시 간단 사유 메모 (선택) */}
        {status !== "going" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="note" className="text-xs font-bold text-foreground">
                사유 및 메모
              </Label>
              <span className="text-[11px] text-muted-foreground">선택 사항</span>
            </div>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 시험 기간, 개인 사정 등 (선택)"
              className="h-9 text-xs bg-background border-border text-foreground placeholder:text-muted-foreground/60"
            />
          </div>
        )}

        {/* 제출 버튼 */}
        <div className="pt-2">
          <Button
            type="submit"
            disabled={pending}
            className="w-full h-10 font-bold shadow-md shadow-primary/20 text-sm"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" /> 제출 중…
              </>
            ) : existingRsvp ? (
              "참가 신청 내역 수정하기"
            ) : (
              "참가 여부 제출하기"
            )}
          </Button>
        </div>
      </form>

      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        title="페이지를 벗어나시겠습니까?"
        description="참가 신청 내용이 아직 제출되지 않았습니다. 지금 페이지를 벗어나면 변경사항이 저장되지 않습니다."
        onClose={cancelLeave}
        onConfirm={confirmLeave}
      />
    </div>
  );
}
