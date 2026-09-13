import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { mapGigRow, type Gig, type GigRsvp } from "@/lib/gig";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { JoinInner } from "./join-inner";
import type { Metadata } from "next";

interface JoinPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: JoinPageProps): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) return { title: "공연 참가 신청" };

  const supabase = await createClient();
  const { data } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("title")
    .eq("id", numericId)
    .maybeSingle();

  return {
    title: data?.title ? `${data.title} - 참가 신청` : "공연 참가 신청",
    description: "SOKNA 공연 참가 여부(참여/불참/미정)를 등록합니다.",
  };
}

export default async function GigJoinPage({ params }: JoinPageProps) {
  const { id } = await params;
  const numericId = Number(id);

  if (isNaN(numericId)) {
    redirect("/gigs");
  }

  const supabase = await createClient();

  // 1. 비회원 차단: 로그인 확인 (비회원에게는 어떠한 정보도 노출하지 않고 로그인으로 리다이렉트)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?redirect=/gigs/${numericId}/join`);
  }

  // 2. 회원 프로필(기수, 파트, 이름 등) 조회
  const { data: userProfile } = await supabase
    .from("users")
    .select("name, generation, part")
    .eq("id", user.id)
    .maybeSingle();

  // 3. 공연 정보 조회 (선곡회의 일시 포함)
  const { data: gigRow, error: gigError } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("*")
    .eq("id", numericId)
    .maybeSingle();

  if (gigError || !gigRow) {
    redirect("/gigs");
  }

  const gig: Gig = mapGigRow(gigRow as Record<string, unknown>);

  // 4. 본인의 기존 RSVP 내역 조회
  const { data: rsvpRow } = await supabase
    .from("gig_rsvps")
    .select("*")
    .eq("gig_id", numericId)
    .eq("user_id", user.id)
    .maybeSingle();

  const existingRsvp: GigRsvp | null = rsvpRow
    ? {
        id: rsvpRow.id,
        gig_id: rsvpRow.gig_id,
        user_id: rsvpRow.user_id,
        status: rsvpRow.status as "going" | "not_going" | "undecided",
        part: rsvpRow.part,
        note: rsvpRow.note,
        created_at: rsvpRow.created_at,
        updated_at: rsvpRow.updated_at,
      }
    : null;

  return (
    <SiteLayout>
      <PageContainer>
        <JoinInner
          gig={gig}
          existingRsvp={existingRsvp}
          defaultPart={userProfile?.part ?? ""}
          userName={userProfile?.name ?? user.email ?? "부원"}
        />
      </PageContainer>
    </SiteLayout>
  );
}
