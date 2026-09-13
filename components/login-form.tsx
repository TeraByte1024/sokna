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
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { UserPlus } from "lucide-react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      // 승인 상태 확인
      if (data.user) {
        const { data: profile } = await supabase
          .from("users")
          .select("status")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profile?.status === "rejected") {
          await supabase.auth.signOut();
          setError("가입 승인이 거절된 계정입니다. 동아리 운영진에게 문의해 주세요.");
          setIsLoading(false);
          return;
        }
      }

      router.push(redirectUrl);
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "로그인 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/60 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">로그인</CardTitle>
          <CardDescription>
            소크나 계정으로 로그인하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-5">
              <div className="grid gap-2">
                <Label htmlFor="email">이메일</Label>
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
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">비밀번호</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    비밀번호를 잊으셨나요?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "로그인 중..." : "로그인"}
              </Button>

              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">또는</span>
                </div>
              </div>

              <GoogleSignInButton text="Google 계정으로 로그인" />
            </div>
            <div className="mt-6 pt-5 border-t border-border/60">
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-center space-y-2.5">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground">
                  <UserPlus className="w-4 h-4 text-primary" />
                  <span>소리로 크는 나무가 처음이신가요?</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  신규 부원 및 동문 회원은 회원가입 신청 후 운영진 승인을 통해 선곡 회의 및 공연 참가 등 모든 기능을 이용하실 수 있습니다.
                </p>
                <Button asChild variant="outline" size="sm" className="w-full border-primary/40 hover:border-primary hover:bg-primary/10 text-primary font-semibold text-xs h-9">
                  <Link href="/auth/sign-up">
                    신규 회원가입 신청하기
                  </Link>
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
