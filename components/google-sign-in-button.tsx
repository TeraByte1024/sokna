"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleLogo } from "@/components/google-logo";
import { createClient } from "@/lib/supabase/client";
import { getOAuthCallbackUrl, type SignupIntent } from "@/lib/auth/login-flow";
import { useSignupConsent } from "@/components/signup-consent";

interface Props {
  text?: string;
  className?: string;
  disabled?: boolean;
  intent?: SignupIntent;
  next?: string;
  signupConsentToken?: string;
}

export function GoogleSignInButton({
  text = "Google로 로그인",
  className,
  disabled = false,
  intent,
  next,
  signupConsentToken,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consent = useSignupConsent("google", undefined, signupConsentToken);

  const handleGoogleLogin = async () => {
    if (disabled || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const choice = signupConsentToken ? await consent.request() : undefined;
      if (signupConsentToken && !choice) { setIsLoading(false); return; }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getOAuthCallbackUrl(window.location.origin, intent, next, choice?.consentState),
          queryParams: {
            access_type: "offline",
            prompt: "select_account consent",
          },
        },
      });

      if (error) {
        console.error("Google 로그인 실패:", error);
        setError("Google 로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Google 로그인 예외:", err);
      setError(err instanceof Error ? err.message : "Google 로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2"><Button
      type="button"
      variant="outline"
      className={`w-full flex items-center justify-center gap-2.5 h-10 border-border/70 hover:bg-muted font-medium transition-all ${className ?? ""}`}
      onClick={handleGoogleLogin}
      disabled={disabled || isLoading}
    >
      <GoogleLogo />
      <span>{isLoading ? "Google 연결 중..." : text}</span>
    </Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {consent.dialog}
    </div>
  );
}
