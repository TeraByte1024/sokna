import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { GigDetailInner } from "@/app/gigs/[id]/gig-detail-inner";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getIsAdmin } from "@/lib/auth-admin";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);

  if (isNaN(numericId)) {
    return {
      title: "공연 정보",
      description: "소크나 공연 상세 정보",
    };
  }

  const supabase = await createClient();
  const { data: gig } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("title, is_public")
    .eq("id", numericId)
    .maybeSingle();

  if (gig && !gig.is_public) {
    const [
      { data: { user } },
      isAdmin,
    ] = await Promise.all([
      supabase.auth.getUser(),
      getIsAdmin(),
    ]);

    let isPerformer = false;
    if (user && !isAdmin) {
      const { data: performer } = await supabase
        .from("performers")
        .select("id")
        .eq("gig_id", numericId)
        .eq("user_id", user.id)
        .maybeSingle();
      isPerformer = Boolean(performer);
    }

    if (!isAdmin && !isPerformer) {
      return {
        title: "비공개 공연 | 공연 정보",
        description: "해당 공연의 참여자와 관리자만 확인할 수 있습니다.",
      };
    }
  }

  return {
    title: gig?.title ? `${gig.title} | 공연 정보` : "공연 상세 정보",
    description: "한양대학교 소리로 크는 나무 공연 상세 및 세션 안내",
  };
}

function GigDetailFallback() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto py-10 animate-pulse">
      <div className="h-6 w-24 bg-muted rounded-md" />
      <div className="h-48 w-full bg-muted rounded-3xl" />
      <div className="h-40 w-full bg-muted rounded-2xl" />
    </div>
  );
}

async function GigDetailLoader({ params }: PageProps) {
  const { id } = await params;
  return <GigDetailInner gigId={id} />;
}

export default function GigDetailPage({ params }: PageProps) {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense fallback={<GigDetailFallback />}>
          <GigDetailLoader params={params} />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
