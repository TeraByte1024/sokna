import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getIsAdmin } from "@/lib/auth-admin";
import { redirect } from "next/navigation";
import { NominationForm } from "@/components/nominations/nomination-form";
import { parseNomination, type RecommendedVocal } from "@/lib/nomination";
import { Lock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

interface PageProps {
	params: Promise<{ id: string; songId: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { id, songId } = await params;
	const numericSongId = Number(songId);

	if (isNaN(numericSongId)) {
		return { title: "후보곡 수정 | 소리로 크는 나무" };
	}

	try {
		const supabase = await createClient();
		const { data: song } = await supabase
			.from("nominations")
			.select("title")
			.eq("id", numericSongId)
			.maybeSingle();

		return {
			title: song?.title
				? `${song.title} 수정 | 소리로 크는 나무`
				: "후보곡 수정 | 소리로 크는 나무",
			description: "선곡 회의 후보곡 정보 및 세션 수정",
		};
	} catch {
		return { title: "후보곡 수정 | 소리로 크는 나무" };
	}
}

export default async function EditNominationPage({ params }: PageProps) {
	const { id, songId } = await params;
	const numericGigId = Number(id);
	const numericSongId = Number(songId);

	if (isNaN(numericGigId) || isNaN(numericSongId)) {
		redirect("/gigs");
	}

	const supabase = await createClient();

	// 1. 로그인 인증 확인
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		redirect(
			`/auth/login?redirect=/gigs/${numericGigId}/nominations/${numericSongId}/edit`,
		);
	}

	// 2. 공연 기본 정보 조회
	const { data: gig } = await supabase
		.from(SUPABASE_GIGS_TABLE)
		.select("id, title")
		.eq("id", numericGigId)
		.maybeSingle();

	if (!gig) {
		redirect("/gigs");
	}

	// 3. 후보곡 정보 조회
	const { data: songRaw, error: songError } = await supabase
		.from("nominations")
		.select(
			`*,
			created_by:performers (
				id,
				user_id,
				part,
				name,
				users (
					name,
					generation
				)
			)`,
		)
		.eq("id", numericSongId)
		.eq("gig_id", numericGigId)
		.maybeSingle();

	if (songError) {
		console.error("[EditNominationPage] Error fetching nomination:", songError);
	}

	if (!songRaw) {
		console.warn(
			`[EditNominationPage] Nomination song not found: songId=${numericSongId}, gigId=${numericGigId}`,
		);
		redirect(`/gigs/${numericGigId}/nominations`);
	}

	const song = parseNomination(songRaw);

	// 4. 권한 검증: 관리자이거나 곡 등록자인지 확인
	const isAdmin = await getIsAdmin();
	const { data: performer } = await supabase
		.from("performers")
		.select("id, user_id, name")
		.eq("gig_id", numericGigId)
		.eq("user_id", user.id)
		.maybeSingle();

	let isCreator =
		song.createdBy?.userId === user.id ||
		(performer && performer.id === songRaw.created_by);

	if (!isCreator && !isAdmin) {
		const { data: userProfile } = await supabase
			.from("users")
			.select("name")
			.eq("id", user.id)
			.maybeSingle();
		const profileName = userProfile?.name || user.user_metadata?.name;
		if (profileName && song.createdBy?.name === profileName) {
			isCreator = true;
		}
	}

	const canEdit = isAdmin || Boolean(isCreator);

	if (!canEdit) {
		return (
			<SiteLayout>
				<PageContainer className="p-4 sm:p-8 lg:p-10">
					<div className="flex flex-col items-center justify-center py-20 text-center gap-6 max-w-md mx-auto">
						<div className="size-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-xs">
							<Lock className="size-8" />
						</div>

						<div className="space-y-2">
							<h2 className="text-xl font-bold tracking-tight text-foreground">
								후보곡 수정 권한 없음
							</h2>
							<p className="text-xs text-muted-foreground leading-relaxed">
								선곡회의 후보곡은 곡을 등록한 본인 또는 관리자만 수정 및 삭제할
								수 있습니다.
							</p>
						</div>

						<div className="flex items-center gap-3">
							<Link href={`/gigs/${numericGigId}/nominations`}>
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

	// 5. 공연 참여자 전체 목록 조회 (보컬 추천용)
	const { data: performersRaw, error: performersError } = await supabase
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
		.eq("gig_id", numericGigId);

	if (performersError) {
		console.error("[EditNominationPage] Error fetching performers:", performersError);
	}

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
					key={song.id}
					mode="edit"
					gigId={numericGigId}
					gigTitle={gig.title || undefined}
					initialData={song}
					performers={performers}
					canDelete={canEdit}
				/>
			</PageContainer>
		</SiteLayout>
	);
}
