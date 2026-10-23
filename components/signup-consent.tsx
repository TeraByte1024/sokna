"use client";

import { useEffect, useRef, useState } from "react";
import { LegalConsentDialog } from "@/components/legal-consent-dialog";
import { bindSocialSignupConsentAction, getSignupLegalDocumentsAction, prepareSignupConsentAction } from "@/app/auth/signup-actions";
import type { LegalConsentState } from "@/lib/legal-consent-model";
import type { SignupConsentMethod } from "@/lib/signup-consent";

type Prompt = Extract<LegalConsentState, { userId: string }>;
type Choice = { token: string; consentState: string };
let promptActive = false;

/** Cancellation resolves before any auth API request is allowed to start. */
export function useSignupConsent(method: SignupConsentMethod, email?: string, priorToken?: string) {
  const [state, setState] = useState<Prompt | null>(null);
  const resolver = useRef<((choice: Choice | null) => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; resolver.current?.(null); }; }, []);
  const close = (choice: Choice | null) => {
    resolver.current?.(choice);
    resolver.current = null;
    setState(null);
  };
  const request = async () => {
    if (priorToken && (method === "google" || method === "kakao")) {
      const result = await bindSocialSignupConsentAction({ token: priorToken, method });
      if (!result.ok) throw new Error(result.error);
      return { token: result.token, consentState: result.consentState };
    }
    if (promptActive) return null;
    promptActive = true;
    try {
      const result = await getSignupLegalDocumentsAction();
      if (!mounted.current) return null;
      if (!result.ok) throw new Error(result.error);
      return await new Promise<Choice | null>((resolve) => {
        resolver.current = resolve;
        setState({ status: result.published ? "required" : "draft", userId: "before-signup", revision: result.revision,
          documents: result.documents, missing: ["terms", "privacy"], marketingOptIn: false });
      });
    } finally { promptActive = false; }
  };
  const dialog = state ? <LegalConsentDialog key={state.revision} state={state} onRefresh={async () => {}} onDismissDraft={() => close(null)}
    beforeSignup={{ onCancel: () => close(null), onAccept: async (choice) => {
      const result = await prepareSignupConsentAction({ method, email, ...choice });
      if (!result.ok) throw new Error(result.error);
      close({ token: result.token, consentState: result.consentState });
    } }} /> : null;
  return { request, dialog };
}
