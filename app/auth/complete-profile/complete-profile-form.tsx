"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LeaveConfirmDialog, useUnsavedChangesWarning } from "@/components/ui/leave-confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { completeProfileAction } from "./actions";
import { Sparkles } from "lucide-react";

const SESSION_PRESETS = [
  "보컬",
  "기타",
  "베이스",
  "드럼",
  "건반",
  "창작",
  "직접 입력",
] as const;

interface Props {
  initialName?: string;
  email?: string;
}

export function CompleteProfileForm({ initialName = "", email = "" }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [generation, setGeneration] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("보컬");
  const [customPart, setCustomPart] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isDirty = useMemo(() => {
    return Boolean(
      (name.trim() && name.trim() !== initialName) ||
      generation.trim() ||
      selectedPreset !== "보컬" ||
      customPart.trim() ||
      agreeTerms ||
      agreeMarketing
    );
  }, [name, initialName, generation, selectedPreset, customPart, agreeTerms, agreeMarketing]);

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    markSubmitting,
  } = useUnsavedChangesWarning({ isDirty });

  const handlePresetSelect = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== "직접 입력") {
      setCustomPart("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("이름(실명)을 입력해 주세요.");
      setIsLoading(false);
      return;
    }

    const genNum = parseInt(generation, 10);
    if (isNaN(genNum) || genNum < 1) {
      setError("올바른 기수를 입력해 주세요. (1 이상의 숫자)");
      setIsLoading(false);
      return;
    }

    const part =
      selectedPreset === "직접 입력" ? customPart.trim() : selectedPreset;
    if (!part) {
      setError("세션(파트)을 선택하거나 입력해 주세요.");
      setIsLoading(false);
      return;
    }

    if (!agreeTerms) {
      setError("개인정보 수집·이용 및 부원 명부 열람에 동의해야 가입을 완료할 수 있습니다.");
      setIsLoading(false);
      return;
    }

    const res = await completeProfileAction(
      trimmedName,
      genNum,
      part,
      agreeMarketing
    );

    if (res.ok) {
      markSubmitting();
      router.push("/auth/sign-up-success");
    } else {
      setError(res.error || "프로필 저장 중 오류가 발생했습니다.");
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card className="border-border/60 shadow-lg">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-1">
          <Sparkles className="w-4 h-4" />
          <span>Google 로그인 성공</span>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">부원 정보 등록</CardTitle>
        <CardDescription className="text-sm text-muted-foreground leading-relaxed">
          동아리 활동 인증을 위해 <strong>기수와 담당 세션</strong>을 입력해 주세요. 운영진 확인 후 승인됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const target = e.target as HTMLElement | null;
              if (target && target.tagName === "INPUT") {
                const input = target as HTMLInputElement;
                if (!["button", "submit", "reset"].includes(input.type)) {
                  e.preventDefault();
                }
              }
            }
          }}
        >
          {email && (
            <div className="rounded-lg bg-muted/40 p-3 text-xs border border-border/40 text-muted-foreground">
              <span className="font-semibold text-foreground">연동 계정:</span> {email}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="name">이름 (실명) <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                type="text"
                placeholder="예: 홍길동"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="generation">동아리 기수 <span className="text-red-500">*</span></Label>
              <div className="relative flex items-center">
                <Input
                  id="generation"
                  type="number"
                  min={1}
                  max={99}
                  placeholder="예: 40"
                  required
                  value={generation}
                  onChange={(e) => setGeneration(e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 text-sm text-muted-foreground pointer-events-none">기</span>
              </div>
            </div>
          </div>

          {/* 세션 프리셋 선택 */}
          <div className="grid gap-2.5">
            <Label>담당 세션 (파트) <span className="text-red-500">*</span></Label>
            <div className="flex flex-wrap gap-2">
              {SESSION_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 border",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-secondary/60 hover:bg-secondary text-secondary-foreground border-border/50"
                    )}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            {selectedPreset === "직접 입력" && (
              <div className="mt-1">
                <Input
                  type="text"
                  placeholder="세션명을 직접 입력해 주세요 (예: 색소폰, 바이올린)"
                  value={customPart}
                  onChange={(e) => setCustomPart(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* 약관 동의 */}
          <div className="space-y-3 rounded-lg bg-muted/40 p-3.5 text-xs text-muted-foreground border border-border/40">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="agree-terms"
                checked={agreeTerms}
                onCheckedChange={(checked) => setAgreeTerms(checked === true)}
                className="mt-0.5"
              />
              <label
                htmlFor="agree-terms"
                className="leading-snug cursor-pointer select-none text-foreground font-medium"
              >
                <span className="text-primary font-bold">[필수]</span> 개인정보 수집·이용 및 부원 명부 내 프로필(이름, 기수, 세션) 회원 열람 동의
              </label>
            </div>

            <div className="flex items-start gap-2.5">
              <Checkbox
                id="agree-marketing"
                checked={agreeMarketing}
                onCheckedChange={(checked) => setAgreeMarketing(checked === true)}
                className="mt-0.5"
              />
              <label
                htmlFor="agree-marketing"
                className="leading-snug cursor-pointer select-none text-foreground font-medium"
              >
                <span className="text-muted-foreground font-bold">[선택]</span> 공연 및 행사 소식 등 웹 푸시 알림 수신 동의
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-10 font-semibold"
            disabled={isLoading || !agreeTerms}
          >
            {isLoading ? "등록 처리 중..." : "부원 정보 등록 완료 및 승인 요청"}
          </Button>
        </form>
      </CardContent>
    </Card>

    <LeaveConfirmDialog
      isOpen={showLeaveModal}
      title="페이지를 벗어나시겠습니까?"
      description="입력 중인 부원 정보가 저장되지 않았습니다. 지금 페이지를 벗어나면 작성 내용이 모두 사라집니다."
      onClose={cancelLeave}
      onConfirm={confirmLeave}
    />
    </>
  );
}
