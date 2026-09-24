import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { GigFormSkeleton } from "@/components/gigs/gig-loading-skeleton";
import { GigEditInner } from "./gig-edit-inner";
import { getGigRow } from "@/lib/gig-server-data";
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
      title: "공연 수정하기",
    };
  }

  if (!(await getIsAdmin())) {
    return { title: "공연 수정하기 | 소리로 크는 나무" };
  }
  const { data: gig } = await getGigRow(numericId);

  return {
    title: gig?.title ? `${gig.title} 수정 | 소리로 크는 나무` : "공연 수정하기 | 소리로 크는 나무",
    description: "공연 정보 및 세션 명단 수정",
  };
}

async function GigEditLoader({ params }: PageProps) {
  const { id } = await params;
  return <GigEditInner gigId={id} />;
}

export default function GigEditPage({ params }: PageProps) {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense fallback={<GigFormSkeleton label="공연 수정 화면을 불러오는 중…" />}>
          <GigEditLoader params={params} />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
