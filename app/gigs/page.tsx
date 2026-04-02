import { Suspense } from "react";
import { GigsInner } from "@/app/gigs/gigs-inner";
import { SiteLayout } from "@/components/site-layout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공연 정보",
  description: "공연 일정 및 참여자 안내",
};

function GigsFallback() {
  return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
}

export default function GigsPage() {
  return (
    <SiteLayout>
      <Suspense fallback={<GigsFallback />}>
        <GigsInner />
      </Suspense>
    </SiteLayout>
  );
}
