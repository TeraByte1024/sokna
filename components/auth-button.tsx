import Link from "next/link";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { UserProfileMenu } from "./user-profile-menu";
import { ShieldAlert, ShieldCheck, Clock } from "lucide-react";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    return (
      <Button asChild size="sm" variant="default" className="h-8 px-3 text-xs sm:text-sm font-semibold shrink-0 shadow-sm">
        <Link href="/auth/login">회원 로그인</Link>
      </Button>
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

    const metadata = user.user_metadata as Record<string, unknown> | undefined;
    const metaFullName = typeof metadata?.full_name === "string" ? metadata.full_name : null;
    const metaName = typeof metadata?.name === "string" ? metadata.name : null;

    userName =
      userProfile?.name?.trim() ||
      metaFullName ||
      metaName ||
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

      {/* 프로필 아이콘 클릭 시 float 메뉴 (내 정보 | 로그아웃) */}
      <UserProfileMenu
        userName={userName}
        userEmail={user.email}
      />
    </div>
  );
}
