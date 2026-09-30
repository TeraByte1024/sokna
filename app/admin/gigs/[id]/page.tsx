import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "공연별 참여자 및 비고" };

function reviewLabel(value: string) {
  if (value === "approved") return "승인";
  if (value === "rejected") return "반려";
  return "대기";
}

export default async function AdminGigDetailPage({ params }: Props) {
  const { id } = await params;
  const gigId = Number(id);
  if (!Number.isSafeInteger(gigId) || gigId <= 0) notFound();
  const supabase = await createClient();
  const [gigResult, performersResult, rsvpsResult] = await Promise.all([
    supabase.from("gigs").select("id, title, perform_date, location").eq("id", gigId).maybeSingle(),
    supabase.from("performers").select("id, name, part, user_id, users(name, generation)").eq("gig_id", gigId).order("created_at"),
    supabase.from("gig_rsvps").select("id, status, review_status, part, note, created_at, reviewed_at, users(name, generation)").eq("gig_id", gigId).order("created_at"),
  ]);
  if (!gigResult.data && !gigResult.error) notFound();
  if (gigResult.error) console.error("관리자 공연 조회 실패:", gigResult.error);
  if (performersResult.error) console.error("관리자 공연자 조회 실패:", performersResult.error);


  if (rsvpsResult.error) console.error("관리자 신청 조회 실패:", rsvpsResult.error);
  const gig = gigResult.data;
  const performers = performersResult.data ?? [];
  const rsvps = rsvpsResult.data ?? [];
  const notes = rsvps.filter((rsvp) => rsvp.note?.trim());
  const pending = rsvps.filter((rsvp) => rsvp.status === "going" && rsvp.review_status === "pending").length;
  return (
    <div className="w-full space-y-7">
      <Link href="/admin/gigs" className="text-sm text-muted-foreground hover:text-foreground hover:underline">← 공연 목록</Link>
      <AdminPageHeading
        title={gig?.title || "공연 관리"}
        description={[gig?.perform_date, gig?.location].filter(Boolean).join(" · ") || "공연 정보"}
        aside={<>
          <span className="rounded-full bg-muted px-3 py-1">확정 참여자 {performers.length}명</span>
          <span className="rounded-full bg-muted px-3 py-1">승인 대기 {pending}건</span>
          <span className="rounded-full bg-muted px-3 py-1">비고 {notes.length}건</span>
        </>}
      />
      {(gigResult.error || performersResult.error || rsvpsResult.error) && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">일부 공연 정보를 불러오지 못했습니다. 새로고침해 주세요.</p>}
      {pending > 0 && <Link href="/admin/approvals" className="inline-flex rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium hover:bg-muted">대기 신청 처리하기 →</Link>}

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20"><CardTitle className="text-lg">확정 참여자</CardTitle></CardHeader>
        <CardContent className="p-0">
          {performers.length === 0 ? <p className="p-6 text-sm text-muted-foreground">확정된 참여자가 없습니다.</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[490px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th scope="col" className="px-4 py-3">이름</th><th scope="col" className="px-4 py-3">기수</th><th scope="col" className="px-4 py-3">담당 세션</th>
              </tr></thead>
              <tbody className="divide-y divide-border/60">{performers.map((performer) => (
                <tr key={performer.id}>
                  <td className="px-4 py-3 font-semibold">{performer.users?.name || performer.name || "이름 없음"}</td>
                  <td className="px-4 py-3">{performer.users?.generation ? `${performer.users.generation}기` : "-"}</td>
                  <td className="px-4 py-3">{performer.part || "-"}</td>
                </tr>
              ))}</tbody>
            </table></div>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20"><CardTitle className="text-lg">신청 비고</CardTitle></CardHeader>
        <CardContent className="p-0">
          {notes.length === 0 ? <p className="p-6 text-sm text-muted-foreground">작성된 비고가 없습니다.</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[630px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th scope="col" className="px-4 py-3">신청자</th><th scope="col" className="px-4 py-3">참여 의사</th>
                <th scope="col" className="px-4 py-3">검토</th><th scope="col" className="px-4 py-3">신청 세션</th>
                <th scope="col" className="px-4 py-3">비고</th>
              </tr></thead>
              <tbody className="divide-y divide-border/60">{notes.map((rsvp) => (
                <tr key={rsvp.id}>
                  <td className="px-4 py-3 font-semibold">{rsvp.users?.name || "회원"}{rsvp.users?.generation ? ` · ${rsvp.users.generation}기` : ""}</td>
                  <td className="px-4 py-3">{rsvp.status === "going" ? "참여" : rsvp.status === "not_going" ? "불참" : "미정"}</td>
                  <td className="px-4 py-3"><Badge variant={rsvp.review_status === "rejected" ? "destructive" : "secondary"}>{rsvp.status === "going" ? reviewLabel(rsvp.review_status) : "-"}</Badge></td>
                  <td className="px-4 py-3">{rsvp.part || "-"}</td>
                  <td className="max-w-md whitespace-pre-wrap break-words px-4 py-3 text-muted-foreground">{rsvp.note}</td>
                </tr>
              ))}</tbody>
            </table></div>}
        </CardContent>
      </Card>
    </div>
  );
}
