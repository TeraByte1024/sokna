import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "공연 관리",
  description: "공연별 참여자와 신청 비고 확인",
};

export default async function AdminGigsPage() {
  const supabase = await createClient();
  const { data: gigs, error } = await supabase
    .from("gigs")
    .select("id, title, perform_date, visibility, performers(id), gig_rsvps(id, status, review_status, note)")
    .order("perform_date", { ascending: false });
  if (error) console.error("관리자 공연 목록 조회 실패:", error);

  return (
    <div className="w-full space-y-7">
      <AdminPageHeading title="공연 관리" description="공연을 선택해 확정 참여자와 신청 비고를 확인합니다." />
      {error ? <p role="alert" className="rounded-xl border border-destructive/30 p-5 text-sm text-destructive">공연 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>
        : !gigs?.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">등록된 공연이 없습니다.</CardContent></Card>
          : <div className="grid gap-3">
            {gigs.map((gig) => {
              const pending = gig.gig_rsvps?.filter((rsvp) => rsvp.status === "going" && rsvp.review_status === "pending").length ?? 0;
              const notes = gig.gig_rsvps?.filter((rsvp) => rsvp.note?.trim()).length ?? 0;
              return (
                <Link key={gig.id} href={`/admin/gigs/${gig.id}`} className="block rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{gig.title || "무제 공연"}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{gig.perform_date || "일정 미정"}</p>
                    </div>
                    <Badge variant="secondary">{gig.visibility === "private" ? "비공개" : gig.visibility === "public" ? "전체 공개" : "회원 공개"}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-3 py-1">확정 참여자 {gig.performers?.length ?? 0}명</span>
                    <span className="rounded-full bg-muted px-3 py-1">승인 대기 {pending}건</span>
                    <span className="rounded-full bg-muted px-3 py-1">비고 {notes}건</span>
                  </div>
                </Link>
              );
            })}
          </div>}
    </div>
  );
}
