import { Suspense } from "react";
import { GigNewInner } from "@/app/gigs/new/gig-new-inner";
import { SiteLayout } from "@/components/site-layout";
import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";

export const metadata: Metadata = {
	title: "공연 추가",
	description: "새 공연 등록",
};

function GigNewFallback() {
	return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
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
