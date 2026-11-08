import Link from "next/link";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { getPendingMemberApplications, hasCompletedMemberProfile } from "@/lib/member-application";
import { UserProfileMenu } from "./user-profile-menu";
import { LogoutButton } from "./logout-button";
import { NotificationMenu } from "./notification-menu";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { ShieldAlert, ShieldCheck, Clock, Ticket, UserRound } from "lucide-react";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    return (
      <Button asChild size="sm" variant="default" className="h-8 px-3 text-xs sm:text-sm font-semibold shrink-0 shadow-sm">
        <Link href="/auth/login">로그인</Link>
      </Button>
    );
  }

  const [isAdmin, unreadNotificationCount] = await Promise.all([
    getIsAdmin(),
    getUnreadNotificationCount(user.sub),
  ]);
  let pendingCount = 0;
  let userStatus: string | null = null;
  let hasCompletedProfile = false;
  let userName: string | null = null;
  let marketingOptIn = false;

  if (user.sub) {
    const { data: userProfile } = await supabase
      .from("users")
      .select("name, status, generation, part, marketing_opt_in")
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
    hasCompletedProfile = hasCompletedMemberProfile(userProfile);
    marketingOptIn = userProfile?.marketing_opt_in ?? false;
  }

  if (isAdmin) {
    // 관리자일 경우 가입 및 공연 신청 대기 건수 조회
    const [{ data: pendingApplications }, { count: pendingGigCount }] = await Promise.all([
      getPendingMemberApplications(supabase),
      supabase.from("gig_rsvps").select("id", { count: "exact", head: true })
        .eq("status", "going").eq("review_status", "pending"),
    ]);
    pendingCount = (pendingApplications?.length ?? 0) + (pendingGigCount ?? 0);
  }

  return (
    <div className="flex items-center gap-2.5 text-xs sm:text-sm">
      {/* 관리자 바로가기 버튼 */}
      {isAdmin && (
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 border-primary/40 hover:border-primary">
          <Link href="/admin/approvals">
            {pendingCount > 0 ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="font-semibold hidden sm:inline">관리자</span>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[11px] h-4 leading-none">
                {pendingCount}
              </Badge>
            )}
          </Link>
        </Button>
      )}

      {/* 미승인 사용자 상태 표시 */}
      {!isAdmin && userStatus === "pending" && hasCompletedProfile && (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1 py-1">
          <Clock className="w-3 h-3" />
          승인 대기 중
        </Badge>
      )}

      <NotificationMenu key={user.sub} userId={user.sub} initialUnreadCount={unreadNotificationCount} />
      <Link
        href="/reservations"
        className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border/50 px-2.5 py-1 text-xs sm:text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-accent shrink-0"
      >
        <Ticket className="size-3.5 text-primary shrink-0" aria-hidden="true" />
        <span>예매</span>
      </Link>
      <Link
        href="/profile"
        aria-label="프로필"
        className="flex md:hidden size-8 shrink-0 items-center justify-center rounded-full border border-border/50 text-foreground transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <UserRound className="size-4" aria-hidden="true" />
      </Link>
      <div className="hidden md:block">
        <UserProfileMenu
          userName={userName}
          userEmail={user.email}
          marketingOptIn={marketingOptIn}
          isMember={isAdmin || userStatus === "approved"}
          hasMembershipApplication={hasCompletedProfile}
        />
      </div>
      {/* 관객 계정도 모바일 헤더에서 바로 로그아웃할 수 있습니다. */}
      {!isAdmin && (!userStatus || userStatus === "pending") && !hasCompletedProfile && (
        <div className="md:hidden">
          <LogoutButton />
        </div>
      )}
    </div>
  );
}
