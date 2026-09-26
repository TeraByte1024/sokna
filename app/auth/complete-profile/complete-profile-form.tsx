"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LeaveConfirmDialog, useUnsavedChangesWarning } from "@/components/ui/leave-confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MemberProfileFields } from "@/components/member-profile-fields";
import { completeProfileAction } from "./actions";
import { Sparkles } from "lucide-react";

interface Props {
  initialName?: string;
  email?: string;
}

export function CompleteProfileForm({ initialName = "", email = "" }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [generation, setGeneration] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("보컬(남)");
  const [customPart, setCustomPart] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isDirty = useMemo(() => {
    return Boolean(
      (name.trim() && name.trim() !== initialName) ||
      generation.trim() ||
      selectedPreset !== "보컬(남)" ||
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
      <Card className="border-border/60 shadow-sm">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-xs mb-1">
          <Sparkles className="size-3.5" />
          <span>Google 로그인 성공</span>
        </div>
        <CardTitle className="text-lg font-bold tracking-tight">부원 정보 등록</CardTitle>
        <CardDescription className="text-xs text-muted-foreground leading-relaxed">
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
            <div className="rounded-lg bg-muted/40 p-3 text-xs border border-border/60 text-muted-foreground break-all">
              <span className="font-semibold text-foreground">연동 계정:</span> {email}
            </div>
          )}

          <MemberProfileFields
            name={name}
            generation={generation}
            selectedPreset={selectedPreset}
            customPart={customPart}
            onNameChange={setName}
            onGenerationChange={setGeneration}
            onPresetChange={handlePresetSelect}
            onCustomPartChange={setCustomPart}
            disabled={isLoading}
          />

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
            {isLoading ? "등록 처리 중..." : "회원가입 요청하기"}
          </Button>
        </form>
      </CardContent>
    </Card>

    <LeaveConfirmDialog
      isOpen={showLeaveModal}
      title="페이지를 벗어나시겠습니까?"
      description="입력 중인 정보가 저장되지 않았습니다. 지금 페이지를 벗어나면 작성 내용이 모두 사라집니다."
      onClose={cancelLeave}
      onConfirm={confirmLeave}
    />
    </>
  );
}
