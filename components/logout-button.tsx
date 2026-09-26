"use client";

import { signOutWithPushSession } from "@/lib/supabase/logout";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const logout = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      await signOutWithPushSession();
      router.push("/auth/login");
      router.refresh();
    } catch {
      toast.error("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsPending(false);
    }
  };

  return <Button onClick={logout} disabled={isPending} variant={"ghost"}>로그아웃 </Button>;
}
