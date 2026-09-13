import { Suspense } from "react";
import { GigNewInner } from "@/app/gigs/new/gig-new-inner";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공연 추가 | 소리로 크는 나무",
  description: "새로운 공연 일정 및 참여 세션 등록",
};

function GigNewFallback() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto py-10 animate-pulse">
      <div className="h-6 w-24 bg-muted rounded-md" />
      <div className="h-10 w-48 bg-muted rounded-lg" />
      <div className="h-80 w-full bg-muted rounded-2xl" />
    </div>
  );
}

export default function GigNewPage() {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense fallback={<GigNewFallback />}>
          <GigNewInner />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
