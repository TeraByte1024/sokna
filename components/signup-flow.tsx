"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignUpForm } from "@/components/sign-up-form";
import { LegalConsentDialog } from "@/components/legal-consent-dialog";
import { Button } from "@/components/ui/button";
import { getSignupLegalDocumentsAction, prepareSignupConsentAction } from "@/app/auth/signup-actions";
import type { LegalConsentState } from "@/lib/legal-consent-model";

type Prompt = Extract<LegalConsentState, { userId: string }>;

export function SignupFlow({ next }: { next: string }) {
  const router = useRouter();
  const [state, setState] = useState<Prompt | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getSignupLegalDocumentsAction().then((result) => {
      if (!active) return;
      if (!result.ok) { setError(result.error); return; }
      setState({ status: result.published ? "required" : "draft", userId: "before-signup", revision: result.revision,
        documents: result.documents, missing: ["terms", "privacy"], marketingOptIn: false });
    }).catch(() => { if (active) setError("가입 약관을 불러오지 못했습니다. 다시 시도해 주세요."); });
    return () => { active = false; };
  }, [attempt]);
  const cancel = () => router.push(`/auth/login?${new URLSearchParams({ redirect: next })}`);
  if (token) return <SignUpForm next={next} consentToken={token} />;
  return <>
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-6 text-center">
      <h1 className="text-lg font-bold">회원가입</h1>
      {!state && <p className="text-sm text-muted-foreground" role={error ? "alert" : "status"}>{error ?? "약관을 불러오는 중..."}</p>}
      {error && <Button onClick={() => { setError(null); setAttempt((value) => value + 1); }}>다시 시도</Button>}
      {!state && <Button variant="outline" onClick={cancel}>로그인으로 돌아가기</Button>}
    </div>
    {state && <LegalConsentDialog state={state} onRefresh={async () => {}} onDismissDraft={cancel}
      beforeSignup={{ onCancel: cancel, onAccept: async (choice) => {
        const result = await prepareSignupConsentAction({ method: "signup", ...choice });
        if (!result.ok) throw new Error(result.error);
        setToken(result.token);
      } }} />}
  </>;
}
