import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { GigEditInner } from "./gig-edit-inner";
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
      title: "공연 정보 수정",
    };
  }

  const supabase = await createClient();
  const { data: gig } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("title")
    .eq("id", numericId)
    .maybeSingle();

  return {
    title: gig?.title ? `${gig.title} 수정 | 소리로 크는 나무` : "공연 수정 | 소리로 크는 나무",
    description: "공연 정보 및 세션 명단 수정",
  };
}

function GigEditFallback() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto py-10 animate-pulse">
      <div className="h-6 w-28 bg-muted rounded-md" />
      <div className="h-10 w-48 bg-muted rounded-lg" />
      <div className="h-96 w-full bg-muted rounded-2xl" />
    </div>
  );
}

async function GigEditLoader({ params }: PageProps) {
  const { id } = await params;
  return <GigEditInner gigId={id} />;
}

export default function GigEditPage({ params }: PageProps) {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense fallback={<GigEditFallback />}>
          <GigEditLoader params={params} />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}

