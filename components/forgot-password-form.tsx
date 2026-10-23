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
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      // 현재 사이트의 재설정 페이지가 Supabase Redirect URLs에 허용되어 있어야 합니다.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch {
      setError("재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <Card className="border-border/60 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">이메일을 확인해 주세요</CardTitle>
            <CardDescription>비밀번호 재설정 메일을 요청했습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              입력한 이메일로 가입한 계정이 있다면 재설정 메일이 발송됩니다.
              메일의 링크를 눌러 새 비밀번호를 설정해 주세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">비밀번호 재설정</CardTitle>
            <CardDescription>
              가입한 이메일로 비밀번호 재설정 링크를 보내드립니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "메일 발송 중..." : "재설정 메일 보내기"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                <Link
                  href="/auth/login"
                  className="underline underline-offset-4"
                >
                  로그인으로 돌아가기
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
