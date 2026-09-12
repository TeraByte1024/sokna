import Link from "next/link";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { LogoutButton } from "./logout-button";
import { ShieldAlert, ShieldCheck, Clock, User } from "lucide-react";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant={"outline"}>
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" variant={"default"}>
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  const isAdmin = await getIsAdmin();
  let pendingCount = 0;
  let userStatus: string | null = null;
  let userName: string | null = null;

  if (user.sub) {
    const { data: userProfile } = await supabase
      .from("users")
      .select("name, status")
      .eq("id", user.sub)
      .maybeSingle();

    userName =
      userProfile?.name?.trim() ||
      (user.user_metadata as Record<string, any> | undefined)?.full_name ||
      (user.user_metadata as Record<string, any> | undefined)?.name ||
      null;
    userStatus = userProfile?.status ?? null;
  }

  if (isAdmin) {
    // 관리자일 경우 대기 중인 회원가입 건수 조회
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingCount = count ?? 0;
  }

  return (
    <div className="flex items-center gap-2.5 text-xs sm:text-sm">
      {/* 관리자 바로가기 버튼 */}
      {isAdmin && (
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 border-primary/40 hover:border-primary">
          <Link href="/admin/members">
            {pendingCount > 0 ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="font-semibold hidden sm:inline">회원 관리</span>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[11px] h-4 leading-none">
                {pendingCount}
              </Badge>
            )}
          </Link>
        </Button>
      )}

      {/* 미승인 사용자 상태 표시 */}
      {!isAdmin && userStatus === "pending" && (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1 py-1">
          <Clock className="w-3 h-3" />
          승인 대기 중
        </Badge>
      )}

      {/* 내 정보(프로필) 바로가기 버튼 */}
      <Button asChild size="sm" variant="ghost" className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
        <Link href="/profile" title="내 정보 확인 및 수정">
          <User className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-medium">내 정보</span>
        </Link>
      </Button>

      {/* 사용자 이름 표시 (이메일 대신 이름 표시, 클릭 시 프로필로 이동) */}
      <Link
        href="/profile"
        title={`내 정보 관리 (${user.email})`}
        className="text-foreground/90 hover:text-primary transition-colors hidden md:inline truncate max-w-[130px] font-semibold text-xs"
      >
        {userName ? `${userName} 님` : user.email}
      </Link>

      <LogoutButton />
    </div>
  );
}
