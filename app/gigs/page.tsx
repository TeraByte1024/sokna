import { Suspense } from "react";
import { GigsInner } from "@/app/gigs/gigs-inner";
import { SiteLayout } from "@/components/site-layout";
import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

export const metadata: Metadata = {
	title: "공연 정보",
	description: "공연 일정 및 참여자 안내",
};

export default function GigsPage() {
	return (
		<SiteLayout>
			<PageContainer>
				<Suspense fallback={<LoadingIndicator label="공연 목록 불러오는 중…" />}>
					<GigsInner />
				</Suspense>
			</PageContainer>
		</SiteLayout>
	);
}
