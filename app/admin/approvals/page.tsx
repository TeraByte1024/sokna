import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPendingMemberApplications } from "@/lib/member-application";
import type { AdminMember } from "@/app/admin/members/actions";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { ApprovalsClient, type PendingGigRsvp } from "./approvals-client";

export const metadata: Metadata = {
  title: "가입/공연 신청 승인",
  description: "회원가입 및 공연 참여 신청 승인과 반려",
};

export default async function AdminApprovalsPage() {
  const supabase = await createClient();
  const [membersResult, rsvpsResult] = await Promise.all([
    getPendingMemberApplications(supabase),
    supabase
      .from("gig_rsvps")
      .select("id, gig_id, user_id, part, note, updated_at, users(name, generation), gigs(title, performers(user_id))")
      .eq("status", "going")
      .eq("review_status", "pending")
      .order("created_at", { ascending: true }),
  ]);
  if (membersResult.error) console.error("가입 신청 조회 실패:", membersResult.error);
  if (rsvpsResult.error) console.error("공연 신청 조회 실패:", rsvpsResult.error);

  const rsvps: PendingGigRsvp[] = (rsvpsResult.data ?? [])
    .filter((row) => !row.gigs?.performers?.some((performer) => performer.user_id === row.user_id))
    .map((row) => ({
      id: row.id,
      gig_id: row.gig_id,
      part: row.part,
      note: row.note,
      updated_at: row.updated_at,
      gigTitle: row.gigs?.title || "무제 공연",
      user: row.users,
    }));

  return (
    <div className="w-full space-y-7">
      <AdminPageHeading
        title="가입/공연 신청 승인"
        description="신청 내용을 검토하고 승인하거나 반려합니다."
        aside={<>
          <span className="rounded-full bg-muted px-3 py-1">가입 대기 {membersResult.data?.length ?? 0}건</span>
          <span className="rounded-full bg-muted px-3 py-1">공연 대기 {rsvps.length}건</span>
        </>}
      />
      <ApprovalsClient
        initialMembers={(membersResult.data ?? []) as AdminMember[]}
        initialRsvps={rsvps}
        memberError={Boolean(membersResult.error)}
        rsvpError={Boolean(rsvpsResult.error)}
      />
    </div>
  );
}
