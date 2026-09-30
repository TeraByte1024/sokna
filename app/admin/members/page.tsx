import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { AdminMember, AdminRecord } from "./actions";
import { MemberManagementClient } from "./member-management-client";

export const metadata: Metadata = {
  title: "회원(관리자) 관리",
  description: "소크나 회원 명부와 관리자 권한 관리",
};

export default async function AdminMembersPage() {
  const supabase = await createClient();
  const [membersResult, adminsResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, generation, part, email, status, applied_at, approved_at, marketing_opt_in")
      .eq("status", "approved")
      .order("generation", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("admins")
      .select("id, email, name, created_at")
      .order("created_at", { ascending: true }),
  ]);
  if (membersResult.error) console.error("회원 명단 조회 실패:", membersResult.error);
  if (adminsResult.error) console.error("관리자 명단 조회 실패:", adminsResult.error);

  return (
    <MemberManagementClient
      initialMembers={(membersResult.data ?? []) as AdminMember[]}
      initialAdmins={(adminsResult.data ?? []) as AdminRecord[]}
      loadError={Boolean(membersResult.error || adminsResult.error)}
    />
  );
}
