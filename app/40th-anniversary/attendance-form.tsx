"use client";

import { useState, useTransition } from "react";
import { submitGigAttendance } from "./actions";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, AlertCircle, Send } from "lucide-react";

/** 40주년 공연 gig_id — 추후 실제 DB 값으로 교체 */
const ANNIVERSARY_GIG_ID = 1;

type AttendanceStatus = "attending" | "declined" | "uncertain";

interface StatusOption {
  value: AttendanceStatus;
  label: string;
  emoji: string;
  description: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: "attending",
    label: "참석",
    emoji: "🎸",
    description: "40주년 공연에 함께합니다",
  },
  {
    value: "uncertain",
    label: "미정",
    emoji: "🤔",
    description: "아직 확정되지 않았어요",
  },
  {
    value: "declined",
    label: "불참",
    emoji: "😢",
    description: "아쉽지만 참석이 어려워요",
  },
];

const PART_OPTIONS = [
  "보컬",
  "기타",
  "베이스",
  "드럼",
  "키보드",
  "기타 (그 외)",
] as const;

export function AttendanceForm() {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] =
    useState<AttendanceStatus>("attending");

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("gig_id", String(ANNIVERSARY_GIG_ID));
    formData.set("attendance_status", selectedStatus);

    startTransition(async () => {
      try {
        const result = await submitGigAttendance(formData);
        if (result.ok) {
          setSubmitted(true);
        } else {
          setError(result.error ?? "알 수 없는 오류가 발생했습니다.");
        }
      } catch (err) {
        console.error("참석 신청 중 예외:", err);
        setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    });
  }

  /* ─── 제출 완료 상태 ─── */
  if (submitted) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-emerald-500/20 p-10 sm:p-14 text-center space-y-6">
        <div className="inline-flex items-center justify-center size-16 rounded-full bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="size-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-white tracking-tight">
            참석 신청이 완료되었습니다!
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            40주년 기념 공연에서 뵙겠습니다. 감사합니다!
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setError(null);
          }}
          className="text-sm text-amber-400 hover:text-amber-300 font-medium underline underline-offset-4 transition-colors"
        >
          추가 신청하기
        </button>
      </div>
    );
  }

  /* ─── 폼 ─── */
  return (
    <form
      action={handleSubmit}
      className="rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 p-6 sm:p-10 space-y-8 backdrop-blur-sm"
    >
      {/* 에러 메시지 */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 참석 여부 선택 카드 */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-white mb-3">
          참석 여부 <span className="text-red-400">*</span>
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedStatus(option.value)}
              className={cn(
                "rounded-2xl border p-4 sm:p-5 text-left transition-all duration-300 cursor-pointer",
                selectedStatus === option.value
                  ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.08)] scale-[1.02]"
                  : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50"
              )}
            >
              <div className="text-2xl mb-2">{option.emoji}</div>
              <div className="text-sm font-bold text-white">{option.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {option.description}
              </div>
            </button>
          ))}
        </div>
      </fieldset>

      {/* 기본 정보 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* 성함 */}
        <div className="space-y-2">
          <label
            htmlFor="att-name"
            className="text-sm font-bold text-white"
          >
            성함 <span className="text-red-400">*</span>
          </label>
          <input
            id="att-name"
            name="name"
            type="text"
            required
            placeholder="이름을 입력해 주세요"
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all"
          />
        </div>

        {/* 기수 */}
        <div className="space-y-2">
          <label
            htmlFor="att-generation"
            className="text-sm font-bold text-white"
          >
            기수
          </label>
          <input
            id="att-generation"
            name="generation"
            type="number"
            min={1}
            max={99}
            placeholder="예: 35"
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all"
          />
        </div>

        {/* 세션/파트 */}
        <div className="space-y-2">
          <label
            htmlFor="att-part"
            className="text-sm font-bold text-white"
          >
            세션 / 파트
          </label>
          <select
            id="att-part"
            name="part"
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all appearance-none"
          >
            <option value="">선택 안 함</option>
            {PART_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* 연락처 */}
        <div className="space-y-2">
          <label
            htmlFor="att-phone"
            className="text-sm font-bold text-white"
          >
            연락처
          </label>
          <input
            id="att-phone"
            name="phone"
            type="tel"
            placeholder="010-0000-0000"
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all"
          />
        </div>

        {/* 동반 인원 */}
        <div className="space-y-2">
          <label
            htmlFor="att-guests"
            className="text-sm font-bold text-white"
          >
            동반 인원
          </label>
          <input
            id="att-guests"
            name="guests_count"
            type="number"
            min={0}
            max={10}
            defaultValue={0}
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all"
          />
        </div>
      </div>

      {/* 전달사항 */}
      <div className="space-y-2">
        <label
          htmlFor="att-memo"
          className="text-sm font-bold text-white"
        >
          전달사항 / 메모
        </label>
        <textarea
          id="att-memo"
          name="memo"
          rows={3}
          placeholder="전하고 싶은 말이 있다면 자유롭게 남겨 주세요"
          className="w-full rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all resize-none"
        />
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={isPending}
        className="group w-full inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-slate-950 disabled:text-slate-400 font-bold text-sm px-8 py-4 rounded-2xl transition-all duration-300 shadow-[0_0_25px_rgba(245,158,11,0.2)] hover:shadow-[0_0_35px_rgba(245,158,11,0.35)] disabled:shadow-none"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            신청 중...
          </>
        ) : (
          <>
            <Send className="size-4" />
            참석 신청 제출하기
          </>
        )}
      </button>
    </form>
  );
}
