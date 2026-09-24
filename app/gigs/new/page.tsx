import { Suspense } from "react";
import { GigNewInner } from "@/app/gigs/new/gig-new-inner";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { GigFormSkeleton } from "@/components/gigs/gig-loading-skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공연 추가 | 소리로 크는 나무",
  description: "새로운 공연 일정 및 참여 세션 등록",
};

export default function GigNewPage() {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense fallback={<GigFormSkeleton label="공연 추가 화면을 불러오는 중…" />}>
          <GigNewInner />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
