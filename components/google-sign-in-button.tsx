"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleLogo } from "@/components/google-logo";
import { createClient } from "@/lib/supabase/client";

interface Props {
  text?: string;
  className?: string;
}

export function GoogleSignInButton({
  text = "Google 계정으로 계속하기",
  className,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "select_account consent",
          },
        },
      });

      if (error) {
        console.error("Google 로그인 실패:", error);
        alert(`로그인 오류: ${error.message}`);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Google 로그인 예외:", err);
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className={`w-full flex items-center justify-center gap-2.5 h-10 border-border/70 hover:bg-muted font-medium transition-all ${className ?? ""}`}
      onClick={handleGoogleLogin}
      disabled={isLoading}
    >
      <GoogleLogo />
      <span>{isLoading ? "Google 연결 중..." : text}</span>
    </Button>
  );
}
