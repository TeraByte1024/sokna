"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Gig, type GigRsvp, type GigRsvpStatus } from "@/lib/gig";
import { submitGigRsvp } from "@/app/gigs/actions";
import { formatKoreanDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Check,
  Loader2,
  X,
  UserCheck,
  Lock,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

interface GigJoinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  gig: Gig;
  existingRsvp: GigRsvp | null;
  defaultPart?: string;
  userName?: string;
  isLoggedIn?: boolean;
}

const GLOBAL_SESSIONS = [
  "보컬(남)",
  "보컬(여)",
  "기타",
  "베이스",
  "키보드",
  "드럼",
];

function resolveInitialPart(partVal?: string | null): string {
  return partVal?.trim() || GLOBAL_SESSIONS[0];
}

export function GigJoinDialog({
  isOpen,
  onClose,
  gig,
  existingRsvp,
  defaultPart = "",
  isLoggedIn = true,
}: GigJoinDialogProps) {
  const router = useRouter();

  const [status, setStatus] = useState<GigRsvpStatus | null>(
    existingRsvp?.status ?? null
  );
  const [part, setPart] = useState<string>(
    resolveInitialPart(existingRsvp?.part || defaultPart)
  );
  const [note, setNote] = useState<string>(existingRsvp?.note || "");
  const [pending, setPending] = useState(false);
  const [customSessions, setCustomSessions] = useState<string[]>([]);
  const [customSession, setCustomSession] = useState("");
  const sessions = Array.from(new Set([
    ...GLOBAL_SESSIONS,
    resolveInitialPart(existingRsvp?.part || defaultPart),
    ...customSessions,
  ]));

  // 모달이 열릴 때 최신 RSVP 상태로 초기화
  useEffect(() => {
    if (isOpen) {
      setStatus(existingRsvp?.status ?? null);
      setPart(resolveInitialPart(existingRsvp?.part || defaultPart));
      setNote(existingRsvp?.note || "");
      setCustomSessions([]);
      setCustomSession("");
    }
  }, [isOpen, existingRsvp, defaultPart]);

  // ESC 키 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !status) return;
    setPending(true);

    const formData = new FormData();
    formData.set("gig_id", String(gig.id));
    formData.set("status", status);
    if (status === "going") {
      formData.set("part", part.trim());
    }
    if (note.trim()) {
      formData.set("note", note.trim());
    }

    try {
      const result = await submitGigRsvp(formData);
      if (result.ok) {
        toast.success(
          existingRsvp
            ? "참가 신청 내역이 수정되었습니다."
            : status === "going"
            ? "참여 신청이 완료되었습니다. 관리자 승인을 기다려 주세요."
            : "공연 참가 여부가 저장되었습니다."
        );
        onClose();
        router.refresh();
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error("참가 신청 처리 중 문제가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  const addCustomSession = () => {
    const session = customSession.trim();
    if (!session || pending) return;
    setCustomSessions((previous) => Array.from(new Set([...previous, session])));
    setPart(session);
    setCustomSession("");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card border border-border/80 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-7 my-auto space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <UserCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-foreground">공연 참여</h3>
                {existingRsvp && (
                  <Badge
                    variant="outline"
                    className={
                      existingRsvp.status === "going"
                        ? "text-amber-500 border-amber-500/40 bg-amber-500/10 text-[11px]"
                        : existingRsvp.status === "not_going"
                        ? "text-destructive border-destructive/40 bg-destructive/10 text-[11px]"
                        : "text-amber-500 border-amber-500/40 bg-amber-500/10 text-[11px]"
                    }
                  >
                    {existingRsvp.status === "going"
                      ? "승인 대기 중"
                      : existingRsvp.status === "not_going"
                      ? "불참 등록됨"
                      : "미정 등록됨"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 2. 포스터 제외한 공연 정보 및 선곡회의 정보 카드 */}
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-3">
          <div>
            <h4 className="text-base font-extrabold text-foreground tracking-tight">
              {gig.title || "무제 공연"}
            </h4>
            {gig.subtitle && (
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {gig.subtitle}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
            {/* 공연 일정 & 장소 */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-background/80 border border-border/60">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                <span>공연 정보</span>
              </div>
              <div className="text-foreground font-medium truncate">
                {formatKoreanDateTime(gig.perform_date, gig.perform_time)}
              </div>
              <div className="text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="size-3 text-muted-foreground shrink-0" />
                <span>{gig.location || "공연 장소 미정"}</span>
              </div>
            </div>

            {/* 선곡회의 일정 & 장소 */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-background/80 border border-border/60">
              <div className="font-semibold text-indigo-500 flex items-center gap-1.5">
                <Clock className="size-3.5" />
                <span>선곡회의 정보</span>
              </div>
              <div className="text-foreground font-medium truncate">
                {gig.meeting_date ? formatKoreanDateTime(gig.meeting_date, gig.meeting_time) : "추후 공지 예정"}
              </div>
              <div className="text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="size-3 text-muted-foreground shrink-0" />
                <span>{gig.meeting_location || "회의 장소 미정"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. 참가 신청 폼 (비로그인 시 로그인 유도) */}
        {!isLoggedIn ? (
          <div className="py-6 text-center space-y-3 bg-muted/20 rounded-2xl border border-border/60 p-4">
            <div className="size-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <Lock className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">로그인이 필요합니다</p>
              <p className="text-xs text-muted-foreground">
                공연 참가 신청은 동아리 부원 로그인 후 가능합니다.
              </p>
            </div>
            <Button asChild className="w-full font-bold">
              <Link href={`/auth/login?redirect=/gigs/${gig.id}`}>
                로그인하러 가기
              </Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 참여 여부 선택 버튼 그룹 */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-foreground">
                참여 여부 <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("going")}
                  aria-pressed={status === "going"}
                  disabled={pending}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                    status === "going"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs ring-1 ring-emerald-500/30"
                      : "border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CheckCircle2 className="size-4" />
                  <span>참여</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatus("not_going")}
                  aria-pressed={status === "not_going"}
                  disabled={pending}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                    status === "not_going"
                      ? "border-destructive bg-destructive/10 text-destructive shadow-xs ring-1 ring-destructive/30"
                      : "border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <XCircle className="size-4" />
                  <span>불참</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatus("undecided")}
                  aria-pressed={status === "undecided"}
                  disabled={pending}
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                    status === "undecided"
                      ? "border-amber-500 bg-amber-500/10 text-amber-500 shadow-xs ring-1 ring-amber-500/30"
                      : "border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <HelpCircle className="size-4" />
                  <span>미정</span>
                </button>
              </div>
            </div>

            {/* 참여 시 기본 세션 및 직접 추가한 세션 선택 */}
            {status === "going" && (
              <div className="space-y-2 animate-in fade-in-50 duration-150">
                <Label className="text-xs font-bold text-foreground">
                  세션 <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
                  {sessions.map((p) => {
                    const isSelected = part === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPart(p)}
                        aria-pressed={isSelected}
                        disabled={pending}
                        className={`min-w-0 break-words text-xs py-2 px-1 rounded-xl border font-bold text-center transition-all ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-xs ring-1 ring-primary/30 scale-[1.02]"
                            : "bg-background border-border/70 text-foreground/80 hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    aria-label="직접 추가할 세션"
                    placeholder="세션 직접 입력 (예: 바이올린)"
                    value={customSession}
                    onChange={(e) => setCustomSession(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addCustomSession();
                      }
                    }}
                    disabled={pending}
                    className="min-w-0 text-xs"
                  />
                  <Button type="button" variant="outline" onClick={addCustomSession} disabled={pending || !customSession.trim()} className="shrink-0 gap-1 text-xs">
                    <Plus className="size-3.5" />
                    추가
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">참여 신청 후 관리자가 승인하면 공연 참여자로 등록됩니다.</p>
              </div>
            )}

            {/* 비고 */}
            <div className="space-y-1.5">
              <Label htmlFor="note_input" className="text-xs font-semibold text-foreground">
                비고
              </Label>
              <Textarea
                id="note_input"
                rows={2}
                value={note}
                disabled={pending}
                onChange={(e) => setNote(e.target.value)}
                placeholder="늦참/불참 예정 등 특이사항이 있으면 적어주세요."
                className="text-xs resize-none"
              />
            </div>

            {/* 다이얼로그 액션 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={pending}
                className="text-xs font-semibold"
              >
                취소
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending || !status || (status === "going" && !part.trim())}
                className="text-xs font-bold gap-1.5"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" />
                    저장
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
