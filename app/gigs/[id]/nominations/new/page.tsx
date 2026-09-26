import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getIsAdmin } from "@/lib/auth-admin";
import { isNominationClosed } from "@/lib/nomination-deadline";
import { redirect } from "next/navigation";
import { NominationForm } from "@/components/nominations/nomination-form";
import type { RecommendedVocal } from "@/lib/nomination";
import { Lock, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

interface PageProps {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { id } = await params;
	const numericId = Number(id);

	if (isNaN(numericId)) {
		return { title: "후보곡 추천 | 소리로 크는 나무" };
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
				? `${gig.title} 후보곡 추천 | 소리로 크는 나무`
				: "후보곡 추천 | 소리로 크는 나무",
			description: "선곡 회의 후보곡 및 필요 세션 등록",
		};
	} catch {
		return { title: "후보곡 추천 | 소리로 크는 나무" };
	}
}

export default async function NewNominationPage({ params }: PageProps) {
	const { id } = await params;
	const numericId = Number(id);

	if (isNaN(numericId)) {
		redirect("/gigs");
	}

	const supabase = await createClient();

	// 1. 로그인 인증 확인
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect(`/auth/login?redirect=/gigs/${numericId}/nominations/new`);
	}

	// 2. 관리자 권한 및 공연 참여자(Performer) 여부 검증
	const isAdmin = await getIsAdmin();
	const { data: performer } = await supabase
		.from("performers")
		.select("id, part, name")
		.eq("gig_id", numericId)
		.eq("user_id", user.id)
		.maybeSingle();

	const { data: gig } = await supabase
		.from(SUPABASE_GIGS_TABLE)
		.select("id, title, perform_date, meeting_date")
		.eq("id", numericId)
		.maybeSingle();

	if (!gig) {
		redirect("/gigs");
	}

	// 참여자가 아니고 관리자도 아닌 경우 접근 차단 안내 화면 표시
	if (!isAdmin && !performer) {
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
								{gig.title} 후보곡 추천 접근 제한
							</h2>
							<p className="text-xs text-muted-foreground leading-relaxed">
								선곡회의 후보곡 추천은 해당 공연의 세션 참여자(Performer) 및
								관리자만 가능합니다.
							</p>
						</div>

						<div className="flex items-center gap-3">
							<Link href={`/gigs/${numericId}/nominations`}>
								<Button variant="outline" size="sm" className="gap-1.5 text-xs">
									<ArrowLeft className="size-3.5" />
									선곡회의로 돌아가기
								</Button>
							</Link>
						</div>
					</div>
				</PageContainer>
			</SiteLayout>
		);
	}

	// 마감 후에는 직접 URL로 접근해도 등록 폼을 제공하지 않음.
	if (!isAdmin && isNominationClosed(gig.meeting_date)) {
		redirect(`/gigs/${numericId}/nominations`);
	}

	// 3. 공연 참여자 전체 목록 조회 (보컬 추천용)
	const { data: performersRaw } = await supabase
		.from("performers")
		.select(`
			id,
			part,
			name,
			user_id,
			users (
				name,
				generation
			)
		`)
		.eq("gig_id", numericId);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const performers: RecommendedVocal[] = (performersRaw || []).map((p: any) => ({
		id: p.id,
		name: p.name || p.users?.name || "참여자",
		part: p.part,
		userId: p.user_id,
		generation: p.users?.generation ?? null,
	}));

	return (
		<SiteLayout>
			<PageContainer className="p-4 sm:p-8">
				<NominationForm
					mode="create"
					gigId={numericId}
					gigTitle={gig.title || undefined}
					performers={performers}
				/>
			</PageContainer>
		</SiteLayout>
	);
}
