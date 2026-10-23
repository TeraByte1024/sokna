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
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LeaveConfirmDialog,
  useUnsavedChangesWarning,
} from "@/components/ui/leave-confirm-dialog";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const isFormDirty = password.length > 0;

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    markSubmitting,
  } = useUnsavedChangesWarning({
    isDirty: isFormDirty,
  });

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      markSubmitting();
      // 재설정 링크로 인증된 세션에서 비밀번호를 변경한 뒤 홈으로 이동합니다.
      router.push("/");
    } catch {
      setError("비밀번호를 변경하지 못했습니다. 재설정 링크를 다시 열거나 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/60 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">새 비밀번호 설정</CardTitle>
          <CardDescription>
            새로 사용할 비밀번호를 입력해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">새 비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="새 비밀번호 입력"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
        title="비밀번호 변경을 취소하시겠습니까?"
        description="입력 중인 새 비밀번호가 저장되지 않았습니다. 지금 페이지를 벗어나면 입력 내용이 모두 사라집니다."
        confirmText="나가기"
        cancelText="계속 작성하기"
      />
    </div>
  );
}
