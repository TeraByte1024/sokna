import { Suspense } from "react";
import { GigsInner } from "@/app/gigs/gigs-inner";
import { SiteLayout } from "@/components/site-layout";
import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { getGigViewer } from "@/lib/gig-viewer";

export const metadata: Metadata = {
	title: "공연 정보",
	description: "공연 일정 및 참여자 안내",
};

export async function AddGigButton() {
  const { isAdmin } = await getGigViewer();
  if (!isAdmin) return null;
  return (
    <Button asChild className="shadow-sm font-semibold">
      <Link href="/gigs/new">
        <Plus className="size-4 mr-1.5" /> 공연 추가
      </Link>
    </Button>
  );
}

export default function GigsPage() {
	return (
		<SiteLayout>
			<PageContainer>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">공연 정보</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">소리로 크는 나무가 준비한 공연을 확인하세요.</p>
          </div>
          <Suspense fallback={null}>
            <AddGigButton />
          </Suspense>
        </div>
				<Suspense fallback={<LoadingIndicator label="공연 목록 불러오는 중…" />}>
					<GigsInner />
				</Suspense>
			</PageContainer>
		</SiteLayout>
	);
}
