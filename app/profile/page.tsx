import { redirect } from "next/navigation";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { hasCompletedMemberProfile } from "@/lib/member-application";
import { ProfileForm, ProfileUser } from "./profile-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "내 정보 | 소크나",
  description: "소크나 회원 프로필 조회 및 정보 수정",
};

function formatConsentTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // 1. users 테이블에서 본인 프로필 조회
  const { data: userRow } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // 2. 관리자 권한 확인
  const isAdmin = await getIsAdmin();

  if (
    !isAdmin &&
    (!userRow || userRow.status === "pending") &&
    !hasCompletedMemberProfile(userRow)
  ) {
    redirect("/auth/complete-profile");
  }

  const profileUser: ProfileUser = {
    id: user.id,
    email: userRow?.email ?? user.email ?? null,
    name: userRow?.name ?? (user.user_metadata?.full_name || user.user_metadata?.name || ""),
    generation: userRow?.generation ? Number(userRow.generation) : null,
    part: userRow?.part ?? null,
    status: userRow?.status ?? "pending",
    applied_at: userRow?.applied_at ?? user.created_at,
    approved_at: userRow?.approved_at ?? null,
    marketing_opt_in: userRow?.marketing_opt_in ?? false,
    marketing_opted_in_label: formatConsentTime(userRow?.marketing_opted_in_at),
  };

  return (
    <SiteLayout>
      <PageContainer>
        <ProfileForm user={profileUser} isAdmin={isAdmin} />
      </PageContainer>
    </SiteLayout>
  );
}
