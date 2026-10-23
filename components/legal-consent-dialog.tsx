"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { acceptLegalDocumentsAction } from "@/app/auth/legal-actions";
import type { LegalConsentState } from "@/lib/legal-consent-model";
import { signOutWithPushSession } from "@/lib/supabase/logout";

type DialogState = Exclude<LegalConsentState, { status: "signed_out" | "not_configured" }>;

export function LegalConsentDialog({ state, onRefresh, onDismissDraft, beforeSignup }: {
  state: DialogState; onRefresh: () => Promise<void>; onDismissDraft: () => void;
  beforeSignup?: {
    onAccept: (choice: { revision: string; termsAgreed: boolean; privacyAgreed: boolean; marketingAgreed: boolean }) => Promise<void>;
    onCancel: () => void;
  };
}) {
  const panel = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const documents = state.status === "error" ? [] : state.documents;
  const draft = state.status === "draft";
  const missing = state.status === "error" ? [] : state.missing;
  const [termsAgreed, setTermsAgreed] = useState(!missing.includes("terms"));
  const [privacyAgreed, setPrivacyAgreed] = useState(!missing.includes("privacy"));
  const [marketingAgreed, setMarketingAgreed] = useState(state.status !== "error" && state.marketingOptIn === true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay.current);
    const inertStates = siblings.map((element) => [element, element.inert] as const);
    for (const [element] of inertStates) element.inert = true;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      for (const [element, inert] of inertStates) element.inert = inert;
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const save = async () => {
    if (pending || (state.status !== "required" && state.status !== "draft") || !termsAgreed || !privacyAgreed) return;
    if (!beforeSignup && state.status === "draft") { onDismissDraft(); return; }
    setPending(true);
    setError(null);
    try {
      if (beforeSignup) {
        await beforeSignup.onAccept({ revision: state.revision, termsAgreed, privacyAgreed, marketingAgreed });
        return;
      }
      const result = await acceptLegalDocumentsAction({ expectedUserId: state.userId, revision: state.revision, termsAgreed, privacyAgreed, marketingAgreed });
      if (!result.ok) {
        setError(result.error);
        if (result.refresh) await onRefresh();
        return;
      }
      await onRefresh();
      router.refresh();
    } catch (cause) {
      setError(beforeSignup && cause instanceof Error ? cause.message : "동의 내역을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally { setPending(false); }
  };

  const logout = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await signOutWithPushSession();
      await onRefresh();
      router.push("/auth/login");
      router.refresh();
    } catch {
      setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      setPending(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={overlay} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-5">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="legal-consent-title" aria-describedby="legal-consent-description"
        tabIndex={-1} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl outline-none"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!pending && beforeSignup) beforeSignup.onCancel();
            else if (draft && !pending) onDismissDraft();
          }
          if (event.key !== "Tab") return;
          const targets = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary, a[href], [tabindex="0"]') ?? []);
          const first = targets[0];
          const last = targets[targets.length - 1];
          if (!first) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <div className="space-y-2 border-b border-border/60 p-5 sm:p-6">
          <h2 id="legal-consent-title" className="text-xl font-bold tracking-tight">약관 동의</h2>
          <p id="legal-consent-description" className="break-keep text-xs leading-relaxed text-muted-foreground">
            {state.status === "error" ? state.message : "서비스 이용을 위해 아래 약관을 확인하고 동의해 주세요."}
          </p>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto p-5 sm:p-6">
          {documents.map((item) => <section key={item.kind} className="overflow-hidden rounded-xl border border-border/70">
            <div className="flex items-center gap-2 p-4">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-semibold leading-relaxed">
              <Checkbox checked={item.kind === "terms" ? termsAgreed : privacyAgreed}
                disabled={pending || !missing.includes(item.kind)}
                onCheckedChange={(checked) => item.kind === "terms" ? setTermsAgreed(checked === true) : setPrivacyAgreed(checked === true)} />
              <span className="break-keep"><span className="mr-1.5 text-xs font-medium text-muted-foreground">[필수]</span>{item.title}{!missing.includes(item.kind) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">동의 완료</span>}</span>
            </label>
            <button type="button" aria-expanded={expanded[item.kind] === true} aria-controls={`legal-content-${item.kind}`}
              className="shrink-0 rounded-sm py-1 text-xs font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setExpanded((current) => ({ ...current, [item.kind]: !current[item.kind] }))}>상세보기</button>
            </div>
            <div id={`legal-content-${item.kind}`} hidden={!expanded[item.kind]} className="space-y-2 border-t border-border/50 bg-muted/20 p-4 text-xs leading-6">
              <p className="text-muted-foreground">게시일 <time dateTime={item.postedOn}>{item.postedOn.replaceAll("-", ".")}</time></p>
              <p className="whitespace-pre-wrap break-words">{item.content}</p>
            </div>
          </section>)}
          {state.status !== "error" && <section className="overflow-hidden rounded-xl border border-border/70">
            <div className="flex items-center gap-2 p-4">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-semibold leading-relaxed">
              <Checkbox checked={marketingAgreed} disabled={pending}
                onCheckedChange={(checked) => setMarketingAgreed(checked === true)} />
              <span className="break-keep"><span className="mr-1.5 text-xs font-medium text-muted-foreground">[선택]</span>마케팅 정보 수신 동의</span>
            </label>
            <button type="button" aria-expanded={expanded.marketing === true} aria-controls="legal-content-marketing"
              className="shrink-0 rounded-sm py-1 text-xs font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setExpanded((current) => ({ ...current, marketing: !current.marketing }))}>상세보기</button>
            </div>
              <div id="legal-content-marketing" hidden={!expanded.marketing} className="space-y-2 border-t border-border/50 bg-muted/20 p-4 text-xs leading-6 text-muted-foreground">
                <p>공연·행사 소식 등 마케팅 정보를 알림으로 받습니다.</p>
                <p>이용 항목: 계정 식별자 및 알림 설정 정보<br />보유기간: 동의 철회 또는 계정 탈퇴 시까지</p>
                <p>동의하지 않아도 서비스를 이용할 수 있으며, 프로필 설정에서 수신 동의를 철회할 수 있습니다.</p>
              </div>
          </section>}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 p-5 sm:flex-row-reverse sm:p-6">
            <Button className="sm:flex-1" disabled={pending || (state.status !== "error" && (!termsAgreed || !privacyAgreed))}
              onClick={state.status === "error" ? () => { void onRefresh(); } : () => { void save(); }}>
              {pending ? "처리 중..." : state.status === "error" ? "다시 확인" : "동의하고 계속하기"}
            </Button>
            <Button variant="outline" className="sm:flex-1" disabled={pending} onClick={() => { if (beforeSignup) beforeSignup.onCancel(); else void logout(); }}>{beforeSignup ? "취소" : "로그아웃"}</Button>
        </div>
      </div>
    </div>, document.body,
  );
}
