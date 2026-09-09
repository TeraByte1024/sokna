import { SiteLayout } from "@/components/site-layout";
import { AnniversaryInner } from "./anniversary-inner";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "40주년 기념 공연",
  description:
    "소리로 크는 나무(소크나) 40주년 기념 공연 안내 및 참석 신청 — 한양대학교 X 한양여자대학교 연합 밴드 동아리",
};

export default function AnniversaryPage() {
  return (
    <SiteLayout>
      <AnniversaryInner />
    </SiteLayout>
  );
}
