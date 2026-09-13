import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { GigDetailInner } from "@/app/gigs/[id]/gig-detail-inner";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
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
    .select("title")
    .eq("id", numericId)
    .maybeSingle();

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

