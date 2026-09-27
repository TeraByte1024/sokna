"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KakaoLogo } from "@/components/kakao-logo";
import { createClient } from "@/lib/supabase/client";
import { isSocialProviderEnabled } from "@/lib/auth/provider-availability";
import { cn } from "@/lib/utils";
import { KAKAO_AUTH_QUERY_PARAMS } from "@/lib/auth/social-providers";

interface KakaoSignInButtonProps {
  className?: string;
  disabled?: boolean;
}

export function KakaoSignInButton({ className, disabled = false }: KakaoSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    const restoreAfterBackNavigation = (event: PageTransitionEvent) => {
      if (!event.persisted || !submittingRef.current) return;
      submittingRef.current = false;
      setIsLoading(false);
    };
    window.addEventListener("pageshow", restoreAfterBackNavigation);
    return () => window.removeEventListener("pageshow", restoreAfterBackNavigation);
  }, []);

  const handleLogin = async () => {
    if (disabled || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      if (!(await isSocialProviderEnabled("kakao"))) {
        setError("카카오 로그인을 아직 사용할 수 없습니다. 다른 로그인 방식을 이용해 주세요.");
        submittingRef.current = false;
        setIsLoading(false);
        return;
      }
      const { data, error: signInError } = await createClient().auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: KAKAO_AUTH_QUERY_PARAMS,
        },
      });
      if (signInError || !data.url) {
        setError(signInError?.code === "provider_disabled" || signInError?.code === "validation_failed"
          ? "현재 카카오 로그인을 사용할 수 없습니다. 다른 로그인 수단을 이용해 주세요."
          : "카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        submittingRef.current = false;
        setIsLoading(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      submittingRef.current = false;
      setIsLoading(false);
      setError("카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className={cn("h-10 w-full gap-2.5 rounded-xl border-transparent bg-[#FEE500] text-[13px] font-medium text-black/85 hover:bg-[#FEE500] hover:text-black/85", className)}
        disabled={disabled || isLoading}
        onClick={handleLogin}
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <KakaoLogo />}
        <span>{isLoading ? "카카오 연결 중..." : "카카오 로그인"}</span>
      </Button>
      {error && <p role="alert" className="text-xs leading-relaxed text-destructive">{error}</p>}
    </div>
  );
}
