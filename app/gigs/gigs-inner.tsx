import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Badge } from "@/components/ui/badge";
import { getIsAdmin } from "@/lib/auth-admin";
import { mapGigRow, type Gig } from "@/lib/gig";
import { getDDay } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { Plus, Calendar, Music, History, Sparkles, MapPin, Lock } from "lucide-react";

function formatDate(d: string | null) {
	if (!d) return "—";
	try {
		return new Date(d + "T12:00:00").toLocaleDateString("ko-KR", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	} catch {
		return d;
	}
}

export async function GigsInner() {
	const supabase = await createClient();
	const [
		{ data: rows, error },
		{ data: { user } },
		isAdmin,
	] = await Promise.all([
		supabase
			.from(SUPABASE_GIGS_TABLE)
			.select("*")
			.order("perform_date", { ascending: false }),
		supabase.auth.getUser(),
		getIsAdmin(),
	]);

	if (error)
		return (
			<p className="text-center py-10 text-destructive">문제가 발생했습니다.</p>
		);

	const allGigs: Gig[] = (rows ?? []).map((r) =>
		mapGigRow(r as Record<string, unknown>),
	);

	let performerGigIds = new Set<number>();
	if (user && !isAdmin) {
		const { data: performerRows } = await supabase
			.from("performers")
			.select("gig_id")
			.eq("user_id", user.id);

		performerGigIds = new Set(
			(performerRows ?? []).map((performer) => performer.gig_id),
		);
	}

	// 공개 공연은 모두에게, 비공개 공연은 관리자와 해당 공연 참여자에게만 노출합니다.
	const gigs = isAdmin
		? allGigs
		: allGigs.filter((gig) => gig.is_public || performerGigIds.has(gig.id));

	// 현재 날짜 기준으로 공연 분류
	const now = new Date();
	now.setHours(0, 0, 0, 0);

	const upcomingGigs = gigs
		.filter((gig) => {
			if (!gig.perform_date) return false;
			return new Date(gig.perform_date + "T00:00:00") >= now;
		})
		.reverse(); // 예정된 공연은 가까운 날짜순으로 표시

	const pastGigs = gigs.filter((gig) => {
		if (!gig.perform_date) return true;
		return new Date(gig.perform_date + "T00:00:00") < now;
	});

	return (
		<div className="flex flex-col gap-12 w-full max-w-5xl mx-auto pb-20">
			{/* 타이틀 섹션 */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b pb-6">
				<div>
					<h1 className="text-3xl font-extrabold tracking-tight text-foreground">
						공연 정보
					</h1>
					<p className="text-muted-foreground mt-1.5 text-sm">
						소리로 크는 나무가 준비한 공연을 확인하세요.
					</p>
				</div>
				{isAdmin && (
					<Button asChild className="shadow-sm font-semibold">
						<Link href="/gigs/new">
							<Plus className="size-4 mr-1.5" /> 공연 추가
						</Link>
					</Button>
				)}
			</div>

			{/* 1. 예정된 공연 섹션 */}
			<section className="space-y-6">
				<div className="flex items-center gap-2 text-primary font-bold text-lg">
					<Sparkles className="size-5" />
					<h2>예정된 공연</h2>
					<span className="ml-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
						{upcomingGigs.length}
					</span>
				</div>

				{upcomingGigs.length === 0 ? (
					<div className="py-14 text-center border-2 border-dashed rounded-3xl bg-muted/20 text-muted-foreground text-sm">
						현재 준비 중인 공연이 없습니다.
					</div>
				) : (
					<GigGrid list={upcomingGigs} />
				)}
			</section>

			{/* 섹션 사이 Divider */}
			<div className="relative py-2">
				<div className="absolute inset-0 flex items-center" aria-hidden="true">
					<div className="w-full border-t border-border/60"></div>
				</div>
				<div className="relative flex justify-center">
					<span className="bg-background px-4 text-muted-foreground/60 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
						<History className="size-4" /> Past Performances
					</span>
				</div>
			</div>

			{/* 2. 지난 공연 섹션 */}
			<section className="space-y-6">
				<div className="flex items-center gap-2 text-foreground font-bold text-lg">
					<History className="size-5 text-muted-foreground" />
					<h2>지난 공연</h2>
					<span className="ml-1 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-semibold">
						{pastGigs.length}
					</span>
				</div>

				{pastGigs.length === 0 ? (
					<p className="text-center py-10 text-muted-foreground text-sm">
						지난 공연 기록이 없습니다.
					</p>
				) : (
					<GigGrid list={pastGigs} isPast preloadFirst={upcomingGigs.length === 0} />
				)}
			</section>
		</div>
	);
}

function GigGrid({
	list,
	isPast = false,
	preloadFirst = true,
}: {
	list: Gig[];
	isPast?: boolean;
	preloadFirst?: boolean;
}) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
			{list.map((gig, index) => {
				const dDay = !isPast ? getDDay(gig.perform_date) : null;

				return (
					<Link
						key={gig.id}
						href={`/gigs/${gig.id}`}
						className="group block"
					>
						<Card className="h-full overflow-hidden border-none shadow-none bg-transparent hover:-translate-y-1.5 transition-all duration-300">
							{/* 1. 포스터 영역 (표준 A-규격 포스터 1:1.414 비율) */}
							<div className="relative aspect-[1/1.414] w-full overflow-hidden rounded-2xl mb-4 shadow-md ring-1 ring-border/60">
								{gig.poster_url ? (
									<ResponsiveImage
										src={gig.poster_url}
										alt={gig.title || "공연 포스터"}
										className="w-full h-full object-cover"
										sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw"
										preload={preloadFirst && index === 0}
									/>
								) : (
									<div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-muted">
										<Music className="size-16 mb-4 text-primary/40" />
										<span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/50">
											SOKNA
										</span>
									</div>
								)}

								{/* D-Day 뱃지 (포스터 좌상단 플로팅) */}
								{dDay && (
									<div className="absolute top-3.5 left-3.5 z-10">
										<Badge className="bg-primary text-primary-foreground font-black px-2.5 py-0.5 text-xs shadow-md border border-white/10">
											{dDay}
										</Badge>
									</div>
								)}

								{/* 비공개 뱃지 (포스터 우상단 플로팅) */}
								{!gig.is_public && (
									<div className="absolute top-3.5 right-3.5 z-10">
										<Badge variant="outline" className="bg-background/90 backdrop-blur-xs text-foreground font-semibold px-2 py-0.5 text-[11px] shadow-xs border-border flex items-center gap-1">
											<Lock className="size-3 text-amber-500" />
											비공개
										</Badge>
									</div>
								)}
							</div>

							{/* 2. 공연 텍스트 정보 (순수 공연 정보만 표시) */}
							<div className="space-y-1.5 px-1">
								<div>
									<h3 className="text-lg sm:text-xl font-bold text-foreground leading-snug group-hover:text-primary transition-colors truncate">
										{gig.title || "제목 없음"}
									</h3>
									{gig.subtitle && (
										<p className="text-xs text-muted-foreground font-medium truncate mt-0.5">
											{gig.subtitle}
										</p>
									)}
								</div>

								{/* 공연 일자 */}
								<div className="flex items-center gap-2 text-sm text-muted-foreground pt-0.5">
									{isPast && (
										<Badge variant="secondary" className="shrink-0 text-xs font-medium px-2 py-0.5">
											종료
										</Badge>
									)}
									<Calendar className="size-4 shrink-0 text-muted-foreground/80" />
									<span className="truncate">
										{formatDate(gig.perform_date)}
									</span>
								</div>

								{/* 공연 장소 (있을 경우 표시) */}
								{gig.location && (
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<MapPin className="size-4 shrink-0 text-muted-foreground/80" />
										<span className="truncate">
											{gig.location}
										</span>
									</div>
								)}
							</div>
						</Card>
					</Link>
				);
			})}
		</div>
	);
}
