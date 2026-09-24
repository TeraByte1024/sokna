import { NominationPanel } from "@/components/nominations/nomination-panel";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { Lock, ArrowLeft, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getIsAdmin } from "@/lib/auth-admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { parseNomination, type RecommendedVocal } from "@/lib/nomination";

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

export default function NominationsPage({ params }: PageProps) {
	return (
		<SiteLayout>
			<PageContainer className="p-4 sm:p-8 lg:p-10 gap-8">
				<Suspense fallback={<LoadingIndicator label="선곡회의 정보를 불러오는 중…" />}>
					<NominationsContent params={params} />
				</Suspense>
			</PageContainer>
		</SiteLayout>
	);
}

async function NominationsContent({ params }: PageProps) {
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
	const [isAdmin, { data: performer }, { data: gig }] = await Promise.all([
		getIsAdmin(),
		supabase
			.from("performers")
			.select("id, part, name")
			.eq("gig_id", numericId)
			.eq("user_id", user.id)
			.maybeSingle(),
		supabase
			.from(SUPABASE_GIGS_TABLE)
			.select("title, meeting_date, perform_date, location")
			.eq("id", numericId)
			.maybeSingle(),
	]);

	// 참여자가 아니고 관리자도 아닌 경우 접근 차단 안내 화면 표시
	if (!isAdmin && !performer) {
		return (
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
		);
	}

	if (!gig) redirect("/gigs");

	const profileLookup = performer
		? Promise.resolve(null)
		: supabase.from("users").select("name").eq("id", user.id).maybeSingle();
	const [nominationRes, performersRes, viewRes, profileRes] = await Promise.all([
		supabase
			.from("nominations")
			.select(`*,
				created_by:performers (id, user_id, name, part, users (name, generation)),
				responses:nomination_responses (
					id, nomination_id, user_id, session_part, status, comment,
					created_at, updated_at, users (name, generation, part)
				)`)
			.eq("gig_id", numericId)
			.order("created_at", { ascending: true }),
		supabase
			.from("performers")
			.select("id, part, name, user_id, users (name, generation)")
			.eq("gig_id", numericId)
			.order("created_at", { ascending: true }),
		supabase
			.from("setlist_views")
			.select("last_viewed_at")
			.eq("gig_id", numericId)
			.eq("user_id", user.id)
			.maybeSingle(),
		profileLookup,
	]);

	type PerformerRow = {
		id: number;
		part: string;
		name: string | null;
		user_id: string | null;
		users: { name: string; generation: number | null } | null;
	};
	const performerRows = (performersRes.data ?? []) as unknown as PerformerRow[];
	const performers: RecommendedVocal[] = performerRows.map((row) => ({
		id: row.id,
		name: row.users?.name || row.name || "익명",
		generation: row.users?.generation ?? null,
		part: row.part || "",
		userId: row.user_id || null,
	}));
	const profileName = profileRes?.data?.name || user.user_metadata?.name;
	const nameMatch = !performer && profileName
		? performerRows.find((row) => row.name === profileName)
		: null;
	const currentPerformer = performer ?? (nameMatch
		? { id: nameMatch.id, part: nameMatch.part, name: nameMatch.name }
		: null);

	return <NominationPanel
		key={numericId}
		initialIsAdmin={isAdmin}
		initialSongs={(nominationRes.data ?? []).map(parseNomination)}
		initialUserId={user.id}
		initialPerformer={currentPerformer}
		initialPerformers={performers}
		initialGigInfo={{
			title: gig.title || "무제",
			meetingDate: gig.meeting_date || "",
			performDate: gig.perform_date || "",
			location: gig.location || "",
		}}
		initialLastViewedTimestamp={viewRes.data?.last_viewed_at ?? null}
	/>;
}
