import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { GigDetailSkeleton } from "@/components/gigs/gig-loading-skeleton";
import { GigDetailInner } from "@/app/gigs/[id]/gig-detail-inner";
import { getGigRow } from "@/lib/gig-server-data";
import { getGigViewer } from "@/lib/gig-viewer";
import { canViewGig, getGigVisibility } from "@/lib/gig-visibility";
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

  const { data: gig } = await getGigRow(numericId);

  const visibility = getGigVisibility(gig ?? {});
  if (gig && visibility !== "public") {
    const viewer = await getGigViewer();

    if (!canViewGig(visibility, viewer)) {
      return {
        title: `${visibility === "private" ? "비공개 공연" : "회원 공개 공연"} | 공연 정보`,
        description: visibility === "private"
          ? "관리자만 확인할 수 있습니다."
          : "가입 승인이 완료된 회원만 확인할 수 있습니다.",
      };
    }
  }

  return {
    title: gig?.title ? `${gig.title} | 공연 정보` : "공연 상세 정보",
    description: "한양대학교 소리로 크는 나무 공연 상세 및 세션 안내",
  };
}

async function GigDetailLoader({ params }: PageProps) {
  const { id } = await params;
  return <GigDetailInner gigId={id} />;
}

export default function GigDetailPage({ params }: PageProps) {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense fallback={<GigDetailSkeleton />}>
          <GigDetailLoader params={params} />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
