"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { GoogleLogo } from "@/components/google-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field-description";
import { getIdentityLinkErrorMessage } from "@/lib/auth/identity-linking";
import type { LoginIdentity } from "@/lib/auth/login-methods";

interface LoginMethodsSectionProps {
  identities: LoginIdentity[];
  result?: string;
  error: string | null;
  successMessage: string | null;
  isPending: boolean;
  isUnlinking: boolean;
  disabled: boolean;
  unlinkTarget: LoginIdentity | null;
  onLinkGoogle: () => void;
  onRequestUnlink: (identityId: string) => void;
  onCancelUnlink: () => void;
  onConfirmUnlink: () => void;
}

export function LoginMethodsSection({
  identities,
  result,
  error,
  successMessage,
  isPending,
  isUnlinking,
  disabled,
  unlinkTarget,
  onLinkGoogle,
  onRequestUnlink,
  onCancelUnlink,
  onConfirmUnlink,
}: LoginMethodsSectionProps) {
  const [fragmentError, setFragmentError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (result !== "failed" || !window.location.hash) return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const code = fragment.get("error_code") || fragment.get("error");
    const knownErrors = ["identity_already_exists", "manual_linking_disabled", "session_changed", "cancelled", "access_denied", "failed"];
    if (code && knownErrors.includes(code)) {
      setFragmentError(getIdentityLinkErrorMessage(code === "access_denied" ? "cancelled" : code));
    }
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  }, [result]);

  useEffect(() => {
    if (unlinkTarget) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [unlinkTarget]);

  const currentError = error || (!successMessage && result === "failed" ? fragmentError : null);
  const isSuccess = !currentError && (Boolean(successMessage) || result === "success");
  const resultMessage = currentError || successMessage || (result
    ? isSuccess
      ? "로그인 수단 연결을 확인했습니다."
      : getIdentityLinkErrorMessage(result)
    : null);
  const controlsDisabled = disabled || isPending || isUnlinking || Boolean(unlinkTarget);
  const unlinkEmail = unlinkTarget?.email?.trim().toLowerCase();
  const hasSameEmailMethod = Boolean(unlinkEmail && identities.some(
    (identity) => identity.id !== unlinkTarget?.id && identity.email?.trim().toLowerCase() === unlinkEmail,
  ));

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          로그인 수단
        </CardTitle>
        <FieldDescription id="login-methods-description">
          이메일이 다른 Google 계정도 연결할 수 있습니다. 연결한 계정으로 로그인하면 같은 회원 정보와 활동 기록을 사용합니다.
        </FieldDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {resultMessage && (
          <div
            role={isSuccess ? "status" : "alert"}
            className={`flex items-start gap-2 rounded-lg border p-3.5 text-xs font-medium leading-relaxed ${
              isSuccess
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-destructive/20 bg-destructive/10 text-destructive"
            }`}
          >
            {isSuccess ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{resultMessage}</span>
          </div>
        )}

        {identities.length > 0 ? (
          <ul aria-label="연결된 로그인 수단" className="divide-y divide-border/50 rounded-lg border border-border/60">
            {identities.map((identity) => (
              <li key={identity.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  {identity.provider === "google" ? (
                    <GoogleLogo className="size-5 shrink-0" />
                  ) : (
                    <Mail className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-semibold">
                      {identity.provider === "google"
                        ? "Google"
                        : identity.provider === "email"
                          ? "이메일"
                          : identity.provider}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {identity.email || "이메일 정보 없음"}
                    </p>
                  </div>
                  {identity.provider === "google" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2.5 text-xs"
                      disabled={controlsDisabled || !identity.canUnlink}
                      aria-label={`Google ${identity.email || "계정"} 연결 해제`}
                      aria-describedby={identity.unlinkDisabledReason ? `unlink-reason-${identity.id}` : undefined}
                      onClick={() => onRequestUnlink(identity.id)}
                    >
                      연결 해제
                    </Button>
                  )}
                </div>
                {identity.provider === "google" && identity.unlinkDisabledReason && (
                  <FieldDescription id={`unlink-reason-${identity.id}`}>
                    {identity.unlinkDisabledReason}
                  </FieldDescription>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">연결된 로그인 수단 정보를 확인할 수 없습니다.</p>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full gap-2 sm:w-auto"
          disabled={controlsDisabled}
          aria-describedby="login-methods-description"
          onClick={onLinkGoogle}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <GoogleLogo />
          )}
          {isPending ? "Google 연결 중..." : "Google 계정 추가하기"}
        </Button>
        <FieldDescription>
          Google에서 추가할 계정을 선택해 주세요. 이미 다른 소크나 계정에서 사용하는 Google 계정은 연결할 수 없습니다.
        </FieldDescription>
      </CardContent>

      <dialog
        id="unlink-google-dialog"
        ref={dialogRef}
        aria-labelledby="unlink-google-title"
        aria-describedby={hasSameEmailMethod ? "unlink-google-description unlink-google-relink-note" : "unlink-google-description"}
        aria-busy={isUnlinking}
        onCancel={(event) => {
          if (isUnlinking) event.preventDefault();
          else onCancelUnlink();
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <h2 id="unlink-google-title" className="text-base font-bold">
              Google 계정 연결을 해제할까요?
            </h2>
            <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 p-3">
              <GoogleLogo className="size-5 shrink-0" />
              <span className="break-all text-sm font-medium">{unlinkTarget?.email || "Google 계정"}</span>
            </div>
            <p id="unlink-google-description" className="text-xs leading-relaxed text-muted-foreground">
              선택한 Google 계정의 연결을 해제합니다. 남아 있는 로그인 수단으로 계속 이용할 수 있으며 회원 정보와 활동 기록은 유지됩니다.
            </p>
            {hasSameEmailMethod && (
              <FieldDescription id="unlink-google-relink-note">
                같은 이메일의 로그인 수단이 남아 있어, 다음 Google 로그인 때 자동으로 다시 연결될 수 있습니다.
              </FieldDescription>
            )}
          </div>
          {error && unlinkTarget && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2.5 border-t border-border/60 pt-4">
            <Button type="button" variant="outline" disabled={isUnlinking} onClick={onCancelUnlink}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={disabled || isPending || isUnlinking || !unlinkTarget?.canUnlink} onClick={onConfirmUnlink}>
              {isUnlinking && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isUnlinking ? "연결 해제 중..." : "연결 해제"}
            </Button>
          </div>
        </div>
      </dialog>
    </Card>
  );
}
