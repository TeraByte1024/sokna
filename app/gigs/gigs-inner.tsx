import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getIsAdmin } from "@/lib/auth-admin";
import { mapGigRow, type Gig } from "@/lib/gig";
import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { Plus } from "lucide-react";

function formatDate(d: string | null) {
	if (!d) return "—";
	try {
		return new Date(d + "T12:00:00").toLocaleDateString("ko-KR", {
			dateStyle: "medium",
		});
	} catch {
		return d;
	}
}

export async function GigsInner() {
	if (!hasEnvVars) {
		return (
			<p className="text-sm text-muted-foreground">
				Supabase 환경 변수를 설정한 뒤 이용할 수 있습니다.
			</p>
		);
	}

	const supabase = await createClient();
	const { data: rows, error } = await supabase
		.from(SUPABASE_GIGS_TABLE)
		.select("*")
		.order("created_at", { ascending: false });

	if (error) {
		return (
			<p className="text-sm text-destructive">
				공연 목록을 불러오지 못했습니다. Supabase에{" "}
				<code className="text-xs bg-muted px-1 rounded">
					{SUPABASE_GIGS_TABLE}
				</code>{" "}
				테이블과 RLS가 준비되었는지 확인하세요. ({error.message})
			</p>
		);
	}

	const gigs: Gig[] = (rows ?? []).map((r) =>
		mapGigRow(r as Record<string, unknown>),
	);

	const isAdmin = await getIsAdmin();

	return (
		<div className="flex flex-col gap-8 w-full">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
						공연 정보
					</h1>
					<p className="text-muted-foreground mt-2 text-sm max-w-2xl">
						소리로 크는 나무의 공연 정보입니다.
					</p>
				</div>
				{/* 관리자일 때만 '공연 추가' 버튼 표시 */}
				{isAdmin && (
					<Button asChild className="shrink-0 w-full sm:w-auto">
						<Link href="/gigs/new">
							<Plus className="size-4" />
							공연 추가
						</Link>
					</Button>
				)}
			</div>

			{gigs.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center text-sm text-muted-foreground">
						등록된 공연이 없습니다.
						{isAdmin ? (
							<>
								{" "}
								<Link
									href="/gigs/new"
									className="text-primary underline-offset-4 hover:underline"
								>
									공연 추가
								</Link>
								로 첫 공연을 등록해 보세요.
							</>
						) : null}
					</CardContent>
				</Card>
			) : (
				<ul className="flex flex-col gap-4">
					{gigs.map((gig) => (
						<li key={gig.id}>
							<Link
								href={`/gigs/${gig.id}/setlists`}
								className="block transition-transform hover:scale-[1.01] active:scale-100"
							>
								<Card className="cursor-pointer hover:border-primary/50 transition-colors">
									<CardHeader className="pb-2">
										<CardTitle className="text-lg leading-snug">
											{gig.title || "제목 없음"}
										</CardTitle>
										<CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
											<span>공연: {formatDate(gig.perform_date)}</span>
											<span>선곡회의: {formatDate(gig.meeting_date)}</span>
										</CardDescription>
									</CardHeader>
									{gig.performers.trim() ? (
										<CardContent className="text-sm">
											<p className="text-xs font-medium text-muted-foreground mb-1">
												참여자
											</p>
											<p className="line-clamp-2 text-muted-foreground leading-relaxed">
												{gig.performers}
											</p>
										</CardContent>
									) : null}
								</Card>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
