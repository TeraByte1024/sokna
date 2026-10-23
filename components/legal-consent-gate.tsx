"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getLegalConsentStateAction } from "@/app/auth/legal-actions";
import { LegalConsentDialog } from "@/components/legal-consent-dialog";
import type { LegalConsentState } from "@/lib/legal-consent-model";
import { createClient } from "@/lib/supabase/client";
import { hasEnvVars } from "@/lib/utils";
import { isPublicLegalPath } from "@/lib/legal-paths";

const recoveryPaths = new Set(["/auth/update-password", "/auth/forgot-password", "/auth/confirm", "/auth/callback", "/auth/error"]);

export function LegalConsentGate() {
  const pathname = usePathname();
  const [state, setState] = useState<LegalConsentState | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);

  const refresh = useCallback(async () => {
    if (isPublicLegalPath(pathname)) return;
    if (!hasEnvVars) return;
    const request = ++sequence.current;
    try {
      // Session presence controls UI only. Every server action verifies getUser().
      const { data: { session } } = await createClient().auth.getSession();
      if (request !== sequence.current) return;
      if (!session) { setState({ status: "signed_out" }); setDismissed(null); return; }
      const result = await getLegalConsentStateAction();
      if (request === sequence.current) setState(result);
    } catch {
      if (request === sequence.current) setState({ status: "error", message: "약관 동의 내역을 확인하지 못했습니다. 다시 시도해 주세요." });
    }
  }, [pathname]);

  useEffect(() => {
    if (!recoveryPaths.has(pathname)) void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    if (!hasEnvVars) return;
    const client = createClient();
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        invalidate();
        setState({ status: "signed_out" });
        setDismissed(null);
      } else if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        // Do not await auth calls inside the Supabase auth lock callback.
        setTimeout(() => { if (active) void refresh(); }, 0);
      }
    });
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      invalidate();
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, invalidate]);

  if (isPublicLegalPath(pathname) || recoveryPaths.has(pathname) || !state || state.status === "signed_out" || state.status === "not_configured" || state.status === "current") return null;
  const key = state.status === "error" ? "error" : `${state.userId}:${state.revision}`;
  if (state.status === "draft" && dismissed === key) return null;
  return <LegalConsentDialog key={key} state={state} onRefresh={refresh} onDismissDraft={() => setDismissed(key)} />;
}
