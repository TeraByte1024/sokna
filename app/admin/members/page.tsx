import { redirect } from "next/navigation";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { AdminMembersClient } from "./admin-members-client";
import { AdminMember, AdminRecord } from "./actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "회원 관리 (관리자)",
  description: "소크나 부원 가입 신청 검토, 승인 및 관리자 권한 관리",
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
  const { data: approvedRows, error: approvedError } = await supabase
    .from("users")
    .select("id, name, generation, part, email, status, applied_at, approved_at, marketing_opt_in")
    .eq("status", "approved")
    .order("generation", { ascending: false })
    .order("name", { ascending: true });

  if (approvedError) {
    console.error("승인 회원 로딩 오류:", approvedError);
  }

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
        />
      </PageContainer>
    </SiteLayout>
  );
}
