import { NominationPanel } from "@/components/nominations/nomination-panel";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { Loader2, Lock, ArrowLeft, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getIsAdmin } from "@/lib/auth-admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface PageProps {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { id } = await params;
	const numericId = Number(id);

	if (isNaN(numericId)) {
		return {
			title: "선곡회의 | 소리로 크는 나무",
			description: "공연 후보곡 제안 및 선곡 회의",
		};
	}

	try {
		const supabase = await createClient();
		const { data: gig } = await supabase
			.from(SUPABASE_GIGS_TABLE)
			.select("title")
			.eq("id", numericId)
			.maybeSingle();

		return {
			title: gig?.title
				? `${gig.title} 선곡회의 | 소리로 크는 나무`
				: "선곡회의 | 소리로 크는 나무",
			description: gig?.title
				? `${gig.title} 공연 후보곡 추천 및 세션 조율 선곡회의`
				: "공연 후보곡 추천 및 세션 조율 선곡회의",
		};
	} catch {
		return {
			title: "선곡회의 | 소리로 크는 나무",
			description: "공연 후보곡 제안 및 선곡 회의",
		};
	}
}

function NominationsLoadingFallback() {
	return (
		<div className="flex flex-col items-center justify-center py-24 gap-4">
			<Loader2 className="size-8 animate-spin text-primary" />
			<p className="text-sm font-medium text-muted-foreground animate-pulse">
				선곡회의 정보를 불러오는 중입니다...
			</p>
		</div>
	);
}

export default async function NominationsPage({ params }: PageProps) {
	const { id } = await params;
	const numericId = Number(id);

	if (isNaN(numericId)) {
		redirect("/gigs");
	}

	const supabase = await createClient();

	// 1. 로그인 인증 확인 (비회원 로그인 리다이렉트)
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect(`/auth/login?redirect=/gigs/${numericId}/nominations`);
	}

	// 2. 관리자 권한 및 공연 참여자(Performer) 여부 검증
	const isAdmin = await getIsAdmin();
	const { data: performer } = await supabase
		.from("performers")
		.select("id, part, name")
		.eq("gig_id", numericId)
		.eq("user_id", user.id)
		.maybeSingle();

	// 참여자가 아니고 관리자도 아닌 경우 접근 차단 안내 화면 표시
	if (!isAdmin && !performer) {
		const { data: gig } = await supabase
			.from(SUPABASE_GIGS_TABLE)
			.select("title")
			.eq("id", numericId)
			.maybeSingle();

		return (
			<SiteLayout>
				<PageContainer className="p-4 sm:p-8 lg:p-10">
					<div className="flex flex-col items-center justify-center py-20 text-center gap-6 max-w-md mx-auto">
						<div className="size-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-xs">
							<Lock className="size-8" />
						</div>

						<div className="space-y-2">
							<div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-semibold text-muted-foreground">
								<Users className="size-3.5" />
								공연 참여자 전용
							</div>
							<h2 className="text-xl font-bold tracking-tight text-foreground">
								{gig?.title ? `${gig.title} 선곡회의` : "선곡회의 접근 제한"}
							</h2>
							<p className="text-xs text-muted-foreground leading-relaxed">
								선곡회의는 해당 공연의 세션 참여자(Performer) 및 관리자만
								입장할 수 있습니다. 공연 상세 페이지에서 참여 신청 상태를
								확인해주세요.
							</p>
						</div>

						<div className="flex flex-wrap items-center justify-center gap-3 pt-2">
							<Button asChild variant="outline" size="sm">
								<Link href={`/gigs/${numericId}`}>
									<ArrowLeft className="size-3.5 mr-1.5" />
									공연 상세로 돌아가기
								</Link>
							</Button>
							<Button asChild size="sm">
								<Link href="/gigs">공연 목록 보기</Link>
							</Button>
						</div>
					</div>
				</PageContainer>
			</SiteLayout>
		);
	}

	return (
		<SiteLayout>
			<PageContainer className="p-4 sm:p-8 lg:p-10 gap-8">
				<Suspense fallback={<NominationsLoadingFallback />}>
					<NominationPanel initialIsAdmin={isAdmin} />
				</Suspense>
			</PageContainer>
		</SiteLayout>
	);
}
