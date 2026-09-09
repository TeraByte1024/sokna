import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { HistoryInner } from "./history-inner";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "동아리 역사 소개",
  description: "소리로 크는 나무(소크나)의 발자취와 역사",
};

export default function HistoryPage() {
  return (
    <SiteLayout>
      <PageContainer>
        <HistoryInner />
      </PageContainer>
    </SiteLayout>
  );
}
