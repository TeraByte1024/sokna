"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { deleteMyAccountAction } from "./actions";

interface DeleteAccountSectionProps {
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
  onDeleted: () => void;
}

async function clearDeletedAccountSession() {
  try {
    window.localStorage.removeItem("sokna-fcm-token");
    window.dispatchEvent(new Event("sokna-push-token-change"));
  } catch {
    // Storage can be unavailable in browsers with restricted persistence.
  }

  const cleanup = Promise.allSettled([
    Promise.resolve().then(() => createClient().auth.signOut({ scope: "local" })),
    import("@/lib/firebase/pushNotification").then(({ deleteFcmToken }) => deleteFcmToken()),
  ]);

  // A slow push service must not leave a deleted account on the profile page.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      cleanup,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 3000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function DeleteAccountSection({
  disabled,
  onPendingChange,
  onDeleted,
}: DeleteAccountSectionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const [confirmation, setConfirmation] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    if (disabled || submittingRef.current) return;
    setConfirmation("");
    setError(null);
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    if (submittingRef.current) return;
    dialogRef.current?.close();
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || submittingRef.current || confirmation !== "탈퇴") return;

    submittingRef.current = true;
    setIsPending(true);
    onPendingChange(true);
    setError(null);

    let deleted = false;
    try {
      const result = await deleteMyAccountAction(confirmation);
      if (!result.ok) {
        setError(result.error || "회원 탈퇴에 실패했습니다. 다시 시도해 주세요.");
        return;
      }

      deleted = true;
      window.alert("회원 탈퇴가 완료되었습니다.");
      onDeleted();
      await clearDeletedAccountSession();
      window.location.replace("/");
    } catch {
      if (deleted) {
        window.location.replace("/");
      } else {
        setError("회원 탈퇴 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (!deleted) {
        submittingRef.current = false;
        setIsPending(false);
        onPendingChange(false);
      }
    }
  };

  return (
    <>
      <Card className="border-destructive/20 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">회원 탈퇴</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            탈퇴하면 계정과 개인 알림·신청 정보가 삭제되며 복구할 수 없습니다.
            공연·선곡 등 함께 만든 기록은 남을 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={disabled || isPending}
            onClick={openDialog}
          >
            회원 탈퇴
          </Button>
        </CardContent>
      </Card>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        aria-busy={isPending}
        onCancel={(event) => {
          if (submittingRef.current) event.preventDefault();
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={handleDelete} className="space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="shrink-0 rounded-xl bg-destructive/10 p-3 text-destructive">
              <AlertTriangle aria-hidden="true" className="size-6" />
            </div>
            <div className="min-w-0 space-y-2">
              <h2 id="delete-account-title" className="text-base font-bold">
                정말 탈퇴하시겠습니까?
              </h2>
              <p id="delete-account-description" className="text-xs leading-relaxed text-muted-foreground">
                계정과 개인 알림·신청 정보가 삭제됩니다. 공연·선곡 등 공유 기록은
                남을 수 있으며, 탈퇴한 계정은 복구할 수 없습니다.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-account-confirmation" className="text-xs leading-relaxed">
              계속하려면 아래에 <span className="font-bold text-destructive">탈퇴</span>를 입력해 주세요.
            </Label>
            <Input
              id="delete-account-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing) {
                  event.preventDefault();
                }
              }}
              autoComplete="off"
              autoFocus
              disabled={isPending}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "delete-account-error" : undefined}
            />
          </div>

          {error && (
            <p id="delete-account-error" role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-border/60 pt-4">
            <Button type="button" variant="outline" disabled={isPending} onClick={closeDialog}>
              취소
            </Button>
            <Button type="submit" variant="destructive" disabled={disabled || isPending || confirmation !== "탈퇴"}>
              {isPending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {isPending ? "탈퇴 처리 중..." : "회원 탈퇴하기"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
