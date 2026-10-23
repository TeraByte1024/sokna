"use client";

import { getMembershipStepUrl } from "@/lib/auth/login-flow";

import { cn } from "@/lib/utils";
import { signUpWithConsentAction } from "@/app/auth/signup-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { KakaoSignInButton } from "@/components/kakao-sign-in-button";
import {
  LeaveConfirmDialog,
  useUnsavedChangesWarning,
} from "@/components/ui/leave-confirm-dialog";

export function SignUpForm({
  className,
  next = "/",
  consentToken,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { next?: string; consentToken: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const isFormDirty = Boolean(
    email.trim() ||
    password ||
    repeatPassword
  );

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    markSubmitting,
  } = useUnsavedChangesWarning({
    isDirty: isFormDirty,
  });

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

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

    try {
      const result = await signUpWithConsentAction({ email, password, token: consentToken, next });
      if (!result.ok) throw new Error(result.error);

      markSubmitting();
      router.push(result.hasSession
        ? getMembershipStepUrl(next, window.location.origin)
        : `/auth/sign-up-success?${new URLSearchParams({ redirect: next })}`);
      router.refresh();
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
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1 pb-4">
          <p className="text-xs text-muted-foreground">1단계 · 계정 생성</p>
          <CardTitle className="text-lg font-bold tracking-tight">회원가입</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-4">
            <GoogleSignInButton text="Google로 가입하기" disabled={isLoading} intent="signup" next={next} signupConsentToken={consentToken} />
            <KakaoSignInButton text="카카오로 가입하기" disabled={isLoading} intent="signup" next={next} signupConsentToken={consentToken} />
            
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">또는 이메일로 가입하기</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSignUp} className="flex flex-col gap-5">
            {/* 기본 로그인 계정 정보 */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="flex items-center gap-1 text-xs font-semibold">이메일 계정 <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="flex items-center gap-1 text-xs font-semibold">비밀번호 <span className="text-destructive">*</span></Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="6자 이상"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="repeat-password" className="flex items-center gap-1 text-xs font-semibold">비밀번호 확인 <span className="text-destructive">*</span></Label>
                  <Input
                    id="repeat-password"
                    type="password"
                    placeholder="비밀번호 재입력"
                    required
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/40 my-1" />

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10 font-semibold"
              disabled={isLoading}
            >
              {isLoading ? "가입 처리 중..." : "가입하기"}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              이미 계정이 있으신가요?{" "}
              <Link href={`/auth/login?${new URLSearchParams({ redirect: next })}`} className="text-primary underline underline-offset-4 hover:opacity-80">
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
