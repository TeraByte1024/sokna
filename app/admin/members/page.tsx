import { redirect } from "next/navigation";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { AdminMembersClient } from "./admin-members-client";
import { AdminMember, AdminRecord } from "./actions";
import { GigRsvpManager } from "@/components/gigs/gig-rsvp-manager";
import type { GigRsvpWithGig } from "@/lib/gig";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "회원 관리 (관리자)",
  description: "소크나 부원 가입·공연 참가 신청 검토, 승인 및 관리자 권한 관리",
};

export default async function AdminMembersPage() {
  const isAdmin = await getIsAdmin();

  // 비관리자 접근 시 메인 화면으로 리다이렉트 (보안 차단)
  if (!isAdmin) {
    redirect("/");
  }

  const supabase = await createClient();

  // 1. 관리자 목록 조회
  const { data: adminRows, error: adminError } = await supabase
    .from("admins")
    .select("id, email, name, created_at")
    .order("created_at", { ascending: true });

  if (adminError) {
    console.error("관리자 목록 로딩 오류:", adminError);
  }

  // 3. 승인 대기 회원 목록
  const { data: pendingRows, error: pendingError } = await supabase
    .from("users")
    .select("id, name, generation, part, email, status, applied_at, approved_at, marketing_opt_in")
    .eq("status", "pending")
    .order("applied_at", { ascending: false });

  if (pendingError) {
    console.error("대기 회원 로딩 오류:", pendingError);
  }

  // 4. 승인 완료 회원 목록
  const [{ data: approvedRows, error: approvedError }, { data: rsvpRows, error: rsvpError }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, generation, part, email, status, applied_at, approved_at, marketing_opt_in")
      .eq("status", "approved")
      .order("generation", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("gig_rsvps")
      .select("*, users(name, generation), gigs(title, performers(user_id))")
      .in("status", ["going", "not_going"])
      .order("created_at", { ascending: true }),
  ]);

  if (approvedError) {
    console.error("승인 회원 로딩 오류:", approvedError);
  }
  if (rsvpError) {
    console.error("공연 참가 신청 로딩 오류:", rsvpError);
  }

  // 다른 공연의 참여 이력은 제외 사유가 아닙니다. 신청한 공연의 명단만 확인합니다.
  const gigRsvps: GigRsvpWithGig[] = (rsvpRows ?? [])
    .filter((rsvp) => !rsvp.gigs?.performers.some((performer) => performer.user_id === rsvp.user_id))
    .map((rsvp) => ({
      id: rsvp.id,
      gig_id: rsvp.gig_id,
      user_id: rsvp.user_id,
      status: rsvp.status as GigRsvpWithGig["status"],
      part: rsvp.part,
      note: rsvp.note,
      created_at: rsvp.created_at,
      updated_at: rsvp.updated_at,
      user: rsvp.users,
      gigTitle: rsvp.gigs?.title || "무제 공연",
    }));

  const admins = (adminRows ?? []) as AdminRecord[];
  const pendingMembers = (pendingRows ?? []) as AdminMember[];
  const approvedMembers = (approvedRows ?? []) as AdminMember[];

  return (
    <SiteLayout>
      <PageContainer>
        <AdminMembersClient
          initialAdmins={admins}
          initialPendingMembers={pendingMembers}
          initialApprovedMembers={approvedMembers}
          gigRsvpSection={rsvpError ? (
            <p role="alert" className="text-sm text-destructive">참가 신청 현황을 불러오지 못했습니다. 새로고침해 주세요.</p>
          ) : (
            <GigRsvpManager rsvps={gigRsvps} />
          )}
        />
      </PageContainer>
    </SiteLayout>
  );
}
