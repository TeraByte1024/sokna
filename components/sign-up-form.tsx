"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import {
  LeaveConfirmDialog,
  useUnsavedChangesWarning,
} from "@/components/ui/leave-confirm-dialog";
import { dispatchSignupPushNotificationsAction } from "@/app/auth/sign-up/actions";

const SESSION_PRESETS = [
  "보컬(남)",
  "보컬(여)",
  "기타",
  "베이스",
  "드럼",
  "건반",
  "창작",
  "직접 입력",
] as const;

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [name, setName] = useState("");
  const [generation, setGeneration] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("보컬(남)");
  const [customPart, setCustomPart] = useState("");
  
  // 약관 동의 상태
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const isFormDirty = Boolean(
    email.trim() ||
    password ||
    repeatPassword ||
    name.trim() ||
    generation.trim() ||
    customPart.trim()
  );

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    markSubmitting,
  } = useUnsavedChangesWarning({
    isDirty: isFormDirty,
  });

  const handlePresetSelect = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== "직접 입력") {
      setCustomPart("");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
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

    if (password !== repeatPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      setIsLoading(false);
      return;
    }

    if (!agreeTerms) {
      setError("부원 명부 열람 및 개인정보 수집·이용에 동의해야 가입할 수 있습니다.");
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: {
            name: trimmedName,
            generation: genNum,
            part,
            marketing_opt_in: agreeMarketing,
          },
        },
      });

      if (signUpError) throw signUpError;

      // DB 트리거가 만든 관리자용 가입 요청 outbox를 즉시 발송합니다.
      // 실패하더라도 가입은 유지되고 cron이 남은 pending 레코드를 복구합니다.
      await dispatchSignupPushNotificationsAction();
      
      markSubmitting();
      router.push("/auth/sign-up-success");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "회원가입 처리 중 오류가 발생했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">회원가입 신청</CardTitle>
          <CardDescription className="text-sm text-muted-foreground leading-relaxed">
            소크나 부원 인증을 위한 계정 신청입니다. 관리자 승인 후 정식 회원으로 활동하실 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            <GoogleSignInButton text="Google 계정으로 간편 가입" />
            
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">또는 이메일로 직접 신청</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSignUp} className="flex flex-col gap-5">
            {/* 기본 로그인 계정 정보 */}
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">이메일 계정 <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="password">비밀번호 <span className="text-red-500">*</span></Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="6자 이상"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="repeat-password">비밀번호 확인 <span className="text-red-500">*</span></Label>
                  <Input
                    id="repeat-password"
                    type="password"
                    placeholder="비밀번호 재입력"
                    required
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/40 my-1" />

            {/* 부원 프로필 정보 */}
            <div className="space-y-4">
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
                      placeholder="예: 39"
                      required
                      value={generation}
                      onChange={(e) => setGeneration(e.target.value)}
                      className="pr-8"
                    />
                    <span className="absolute right-3 text-sm text-muted-foreground pointer-events-none">기</span>
                  </div>
                </div>
              </div>

              {/* 세션(파트) 프리셋 선택 */}
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
            </div>

            <div className="border-t border-border/40 my-1" />

            {/* 약관 동의 섹션 */}
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
                  <p className="text-muted-foreground font-normal mt-0.5 text-[11px]">
                    동아리 회원 인증 및 내부 친목 도모를 위해 인증된 회원에게 이름, 기수, 세션 정보가 열람될 수 있습니다.
                  </p>
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
                  <p className="text-muted-foreground font-normal mt-0.5 text-[11px]">
                    정기 공연, 총회, 동문 행사 안내 등 주요 소식을 브라우저 푸시 알림으로 받아보실 수 있습니다.
                  </p>
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
              {isLoading ? "가입 신청 처리 중..." : "회원가입 신청하기"}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              이미 계정이 있으신가요?{" "}
              <Link href="/auth/login" className="text-primary underline underline-offset-4 hover:opacity-80">
                로그인
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
        title="회원가입을 중단하시겠습니까?"
        description="작성 중인 가입 정보가 저장되지 않았습니다. 지금 페이지를 벗어나면 입력 내용이 모두 사라집니다."
        confirmText="나가기"
        cancelText="계속 작성하기"
      />
    </div>
  );
}
