import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GigEditSection } from "@/components/gigs/gig-edit-section";
import { GigSectionLinks } from "@/components/admin/gig-section-links";
import { GigNominationList } from "@/components/admin/gig-nomination-list";
import { GigFormSkeleton } from "@/components/gigs/gig-loading-skeleton";
import { getGigRow } from "@/lib/gig-server-data";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { PerformerSongResponses } from "@/components/admin/performer-song-responses";
import { parseNomination } from "@/lib/nomination";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "공연 관리 및 곡 응답 현황" };

export default async function AdminGigDetailPage({ params }: Props) {
  const { id } = await params;
  const gigId = Number(id);
  if (!Number.isSafeInteger(gigId) || gigId <= 0) notFound();
  const supabase = await createClient();
  const [gigResult, performersResult, rsvpsResult, songsResult] = await Promise.all([
    getGigRow(gigId),
    supabase.from("performers").select("id, name, part, user_id, users(name, generation)").eq("gig_id", gigId).order("created_at"),
    supabase.from("gig_rsvps").select("user_id, status, review_status, note").eq("gig_id", gigId),
    supabase.from("nominations").select("*, responses:nomination_responses(id, nomination_id, user_id, session_part, status, comment, created_at, updated_at)").eq("gig_id", gigId).order("created_at").order("id"),
  ]);
  if (!gigResult.data && !gigResult.error) notFound();
  if (gigResult.error) console.error("관리자 공연 조회 실패:", gigResult.error);
  if (performersResult.error) console.error("관리자 공연자 조회 실패:", performersResult.error);


  if (rsvpsResult.error) console.error("관리자 신청 조회 실패:", rsvpsResult.error);
  if (songsResult.error) console.error("관리자 곡 응답 조회 실패:", songsResult.error);
  const gig = gigResult.data;
  const performers = performersResult.data ?? [];
  const songs = (songsResult.data ?? []).map(parseNomination);
  const rsvps = rsvpsResult.data ?? [];
  const performerNotes = Object.fromEntries(rsvps.filter((rsvp) => rsvp.note?.trim()).map((rsvp) => [rsvp.user_id, rsvp.note!.trim()]));
  const noteCount = performers.filter((performer) => performer.user_id && performerNotes[performer.user_id]).length;
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
          <span className="rounded-full bg-muted px-3 py-1">참여자 비고 {noteCount}건</span>
        </>}
      />
      {(gigResult.error || performersResult.error || rsvpsResult.error) && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">일부 공연 정보를 불러오지 못했습니다. 새로고침해 주세요.</p>}
      <div className="flex flex-wrap gap-2">
        {gig && <GigSectionLinks />}
        {pending > 0 && <Button asChild variant="outline"><Link href="/admin/approvals">대기 신청 처리하기 →</Link></Button>}
      </div>

      {gig && <Suspense fallback={<GigFormSkeleton label="공연 수정 정보를 불러오는 중…" />}>
        <GigEditSection
          gigId={String(gigId)}
          performerNotes={performerNotes}
          performerNotesLoadError={Boolean(rsvpsResult.error)}
          afterBasicInfo={<GigNominationList gigId={gigId} songs={songs} loadError={Boolean(songsResult.error)} />}
        />
      </Suspense>}

      <PerformerSongResponses
        gigId={gigId}
        performers={performers.map((performer) => ({
          id: performer.id,
          name: performer.users?.name || performer.name || "이름 없음",
          generation: performer.users?.generation ?? null,
          part: performer.part || "",
          userId: performer.user_id,
        }))}
        songs={songs}
        loadError={Boolean(songsResult.error || performersResult.error)}
      />


    </div>
  );
}
