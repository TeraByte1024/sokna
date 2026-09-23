"use client";

import {
	useCallback,
	useRef,
	useState,
	useTransition,
	useEffect,
	useMemo,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
	Plus,
	Loader2,
	AlarmClock,
	ArrowLeft,
	Music2,
	Disc3,
	Search,
	X,
	ChevronRight,
	Play,
	Sparkles,
	Calendar,
	MapPin,
	Filter,
	Lock,
	CheckCheck,
	CheckCircle2,
	XCircle,
	ChevronDown,
	RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
	type Nomination,
	type RecommendedVocal,
	parseNomination,
	getYouTubeVideoId,
	getYouTubeThumbnailUrl,
	isMaleVocalPart,
	isFemaleVocalPart,
	extractYouTubeTimestamp,
	formatSecondsToTime,
	sortSessionParts,
} from "@/lib/nomination";
import { NominationDrawer } from "@/components/nominations/nomination-drawer";
import {
	updateNominationViewAction,
} from "@/app/gigs/[id]/nominations/actions";
import { toast } from "sonner";
import { cn, getDDay } from "@/lib/utils";

const DEADLINE_COLUMN = "meeting_date";
const DEFAULT_REQUIRED_PARTS = ["보컬(남)", "기타", "베이스", "드럼", "건반"];
const SESSION_FILTER_PARTS = [
	"보컬(남)",
	"보컬(여)",
	"건반",
];

/**
 * 마감 기한까지 남은 시간을 계산 (회의 1일 전 마감)
 */
const getRemainingTime = (targetDate: string) => {
	if (!targetDate) return { dd: 0, hh: 0, mm: 0, isOver: true };

	const deadline = new Date(targetDate);
	deadline.setDate(deadline.getDate() - 1);

	const now = new Date();
	const diff = deadline.getTime() - now.getTime();

	if (diff <= 0) return { dd: 0, hh: 0, mm: 0, isOver: true };

	return {
		dd: Math.floor(diff / (1000 * 60 * 60 * 24)),
		hh: Math.floor((diff / (1000 * 60 * 60)) % 24),
		mm: Math.floor((diff / (1000 * 60)) % 60),
		isOver: false,
	};
};

function formatDateKorean(dateStr?: string | null) {
	if (!dateStr) return "";
	try {
		const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
		return d.toLocaleDateString("ko-KR", {
			year: "numeric",
			month: "long",
			day: "numeric",
			weekday: "short",
		});
	} catch {
		return dateStr;
	}
}

interface NominationPanelProps {
	initialIsAdmin?: boolean;
}

export function NominationPanel({ initialIsAdmin = false }: NominationPanelProps) {
	const params = useParams();
	const router = useRouter();
	const gigId = params.id as string;
	const supabase = createClient();

	const [songs, setSongs] = useState<Nomination[]>([]);
	const [selectedSong, setSelectedSong] = useState<Nomination | null>(null);
	const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
	const [currentPerformer, setCurrentPerformer] = useState<{ id: number; part: string; name?: string | null } | null>(null);
	const [performers, setPerformers] = useState<RecommendedVocal[]>([]);
	const [isAdmin, setIsAdmin] = useState(initialIsAdmin);
	const [gigInfo, setGigInfo] = useState<{
		title: string;
		meetingDate: string;
		performDate?: string;
		location?: string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [timeLeft, setTimeLeft] = useState(getRemainingTime(""));

	// 마지막 조회 시점(하이라이트 기준) 및 확인된 곡 목록
	const [lastViewedTimestamp, setLastViewedTimestamp] = useState<string | null>(null);
	const [viewedSongIds, setViewedSongIds] = useState<Set<number>>(new Set());

	// 검색 및 필터링 상태
	const [searchQuery, setSearchQuery] = useState("");
	const [sheetFilter, setSheetFilter] = useState<"all" | "has_sheet" | "no_sheet">("all");
	const [partFilter, setPartFilter] = useState<string>("all");
	const [responseFilter, setResponseFilter] = useState<"all" | "available" | "unavailable" | "undecided">("all");
	const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
	const [onlyChangedFilter, setOnlyChangedFilter] = useState<boolean>(false);

	useEffect(() => {
		async function init() {
			setIsLoading(true);
			try {
				const numericGigId = Number(gigId);
				const [gigRes, nominationRes, authUserRes, performersRes] = await Promise.all([
					supabase
						.from("gigs")
						.select(`title, ${DEADLINE_COLUMN}, perform_date, location`)
						.eq("id", isNaN(numericGigId) ? gigId : numericGigId)
						.single(),
					supabase
						.from("nominations")
						.select(
							`*,
                created_by:performers (
									id,
									user_id,
									name,
									part,
									users (
										name,
										generation
									)
								),
								responses:nomination_responses (
									id,
									nomination_id,
									user_id,
									session_part,
									status,
									comment,
									created_at,
									updated_at,
									users (
										name,
										generation,
										part
									)
								)
              `,
						)
						.eq("gig_id", isNaN(numericGigId) ? gigId : numericGigId)
						.order("created_at", { ascending: true }),
					supabase.auth.getUser(),
					supabase
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
						.eq("gig_id", isNaN(numericGigId) ? gigId : numericGigId)
						.order("created_at", { ascending: true }),
				]);

				if (performersRes.data) {
					type PerformerRow = {
						id: number;
						part: string;
						name: string | null;
						user_id: string | null;
						users: { name: string; generation: number | null } | null;
					};
					const mapped: RecommendedVocal[] = (performersRes.data as unknown as PerformerRow[]).map((p) => ({
						id: p.id,
						name: p.users?.name || p.name || "익명",
						generation: p.users?.generation ?? null,
						part: p.part || "",
						userId: p.user_id || null,
					}));
					setPerformers(mapped);
				}

				if (authUserRes.data.user) {
					const uid = authUserRes.data.user.id;
					const uEmail = authUserRes.data.user.email?.trim() || "";
					setCurrentUser(authUserRes.data.user);
					const [{ data: adminRow }, { data: perfRow }, { data: viewRow }] = await Promise.all([
						supabase
							.from("admins")
							.select("id")
							.or(`id.eq.${uid},email.eq.${uEmail}`)
							.maybeSingle(),
						supabase
							.from("performers")
							.select("id, part, name")
							.eq("gig_id", isNaN(numericGigId) ? gigId : numericGigId)
							.eq("user_id", uid)
							.maybeSingle(),
						supabase
							.from("setlist_views")
							.select("last_viewed_at")
							.eq("gig_id", isNaN(numericGigId) ? gigId : numericGigId)
							.eq("user_id", uid)
							.maybeSingle(),
					]);
					setIsAdmin((prev) => prev || Boolean(adminRow));
					let activePerformer = perfRow;
					if (!activePerformer) {
						// user_id가 미연동된 performer인 경우 유저 프로필 이름으로 fallback 매칭
						const { data: userProfile } = await supabase
							.from("users")
							.select("name")
							.eq("id", uid)
							.maybeSingle();
						const profileName = userProfile?.name || authUserRes.data.user.user_metadata?.name;
						if (profileName) {
							const { data: nameMatchPerf } = await supabase
								.from("performers")
								.select("id, part, name")
								.eq("gig_id", isNaN(numericGigId) ? gigId : numericGigId)
								.eq("name", profileName)
								.maybeSingle();
							if (nameMatchPerf) activePerformer = nameMatchPerf;
						}
					}
					if (activePerformer) setCurrentPerformer(activePerformer);

					// 마지막 조회 시점 로드 (DB 우선, fallback: localStorage)
					let previousTimestamp = viewRow?.last_viewed_at ?? null;
					if (!previousTimestamp && typeof window !== "undefined") {
						const localSaved = localStorage.getItem(`sokna_setlist_view_${gigId}_${uid}`);
						if (localSaved) previousTimestamp = localSaved;
					}

					setLastViewedTimestamp(previousTimestamp);
				}

				if (gigRes.data) {
					const mDate = gigRes.data[DEADLINE_COLUMN] || "";
					setGigInfo({
						title: gigRes.data.title || "무제",
						meetingDate: mDate,
						performDate: gigRes.data.perform_date || "",
						location: gigRes.data.location || "",
					});
					setTimeLeft(getRemainingTime(mDate));
				}
				if (nominationRes.data) setSongs(nominationRes.data.map(parseNomination));
			} finally {
				setIsLoading(false);
			}
		}
		init();
	}, [gigId, supabase]);

	// 곡별 하이라이트 상태 판별 ("new" | "updated" | null)
	const getSongHighlightState = useCallback(
		(song: Nomination): "new" | "updated" | null => {
			if (!lastViewedTimestamp) return null;
			if (viewedSongIds.has(song.id)) return null;

			const lastViewed = new Date(lastViewedTimestamp).getTime();
			const songCreated = new Date(song.createdAt).getTime();
			const songUpdated = new Date(song.updatedAt).getTime();

			// 마지막 조회 이후 신규 등록된 경우
			if (songCreated > lastViewed) {
				return "new";
			}

			// 마지막 조회 이후 수정된 경우 (단, 생성 시각과 2초 이상 차이날 때만 수정으로 판정)
			if (songUpdated > lastViewed && songUpdated - songCreated > 2000) {
				return "updated";
			}

			return null;
		},
		[lastViewedTimestamp, viewedSongIds],
	);

	// 전체 변경/신규 곡 수 계산
	const changedCount = useMemo(() => {
		return songs.filter((s) => Boolean(getSongHighlightState(s))).length;
	}, [songs, getSongHighlightState]);

	// 모든 변경 사항 확인 완료 처리
	const handleMarkAllAsViewed = async () => {
		const now = new Date().toISOString();
		setLastViewedTimestamp(now);
		setViewedSongIds(new Set(songs.map((s) => s.id)));
		setOnlyChangedFilter(false);

		if (currentUser?.id) {
			if (typeof window !== "undefined") {
				localStorage.setItem(`sokna_setlist_view_${gigId}_${currentUser.id}`, now);
			}
			try {
				await updateNominationViewAction(gigId);
			} catch (err) {
				console.warn("조회 일시 갱신 실패:", err);
			}
		}
		toast.success("모든 곡의 변경 사항을 확인 완료 처리했습니다.");
	};

	useEffect(() => {
		if (!gigInfo?.meetingDate) return;
		const timer = setInterval(
			() => setTimeLeft(getRemainingTime(gigInfo.meetingDate)),
			60000,
		);
		return () => clearInterval(timer);
	}, [gigInfo?.meetingDate]);

	// 필터링 및 정렬된 곡 목록 (항상 등록순 - 처음 등록한 것이 위로 오도록 정렬)
	const filteredSongs = useMemo(() => {
		return songs
			.filter((song) => {
				// 변경/신규 곡만 보기 필터
				if (onlyChangedFilter && !getSongHighlightState(song)) {
					return false;
				}

				// 1. 검색어 필터
				if (searchQuery.trim()) {
					const q = searchQuery.toLowerCase().trim();
					const matchTitle = song.title.toLowerCase().includes(q);
					const matchArtist = (song.artist || "").toLowerCase().includes(q);
					const matchCreator = (song.createdBy?.name || "").toLowerCase().includes(q);
					if (!matchTitle && !matchArtist && !matchCreator) return false;
				}

				// 2. 악보 필터
				if (sheetFilter === "has_sheet" && !song.sheetExists) return false;
				if (sheetFilter === "no_sheet" && song.sheetExists) return false;

				// 3. 파트 필터
				if (partFilter !== "all") {
					if (partFilter === "보컬(남)" || partFilter === "남보컬") {
						if (!song.requiredParts?.some(isMaleVocalPart)) return false;
					} else if (partFilter === "보컬(여)" || partFilter === "여보컬") {
						if (!song.requiredParts?.some(isFemaleVocalPart)) return false;
					} else {
						if (!song.requiredParts?.some((p) => p.includes(partFilter))) return false;
					}
				}

				// 4. 내 응답 필터 (가능 / 불가능 / 미선택)
				if (responseFilter !== "all" && currentUser) {
					const myResp = song.responses?.find((r) => r.userId === currentUser.id);
					const myStatus = myResp?.status || "undecided";
					if (myStatus !== responseFilter) return false;
				}

				return true;
			})
			.sort((a, b) => {
				const timeA = new Date(a.createdAt).getTime();
				const timeB = new Date(b.createdAt).getTime();
				if (timeA !== timeB) return timeA - timeB;
				return a.id - b.id;
			});
	}, [songs, onlyChangedFilter, searchQuery, sheetFilter, partFilter, responseFilter, currentUser, getSongHighlightState]);

	const activeFilterCount =
		(partFilter !== "all" ? 1 : 0) +
		(responseFilter !== "all" ? 1 : 0) +
		(sheetFilter !== "all" ? 1 : 0);

	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center py-20 gap-4">
				<Loader2 className="size-8 animate-spin text-primary" />
				<p className="text-sm text-muted-foreground animate-pulse font-medium">
					선곡회의 목록을 불러오는 중입니다...
				</p>
			</div>
		);
	}

	const dDay = gigInfo?.performDate ? getDDay(gigInfo.performDate) : "";
	const canRecommend = isAdmin || (!timeLeft.isOver && Boolean(currentPerformer));
	const recommendationTitle =
		isAdmin && timeLeft.isOver
			? "선곡회의가 마감되었으나 관리자 권한으로 후보곡을 추천할 수 있습니다."
			: !isAdmin && timeLeft.isOver
				? "선곡회의 접수가 마감되었습니다."
				: !isAdmin && !currentPerformer
					? "공연 참여자만 후보곡을 추천할 수 있습니다."
					: "후보곡 추천하기";

	return (
		<div className="flex flex-col gap-8 w-full pb-16">
			{/* 1. 상단 내비게이션 바 */}
			<div className="flex items-center justify-between gap-4">
				<Link
					href={`/gigs/${gigId}`}
					className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
				>
					<ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
					<span>공연 상세 정보로 돌아가기</span>
				</Link>

				<div className="text-xs text-muted-foreground font-medium hidden sm:block">
					공연 &gt; {gigInfo?.title} &gt; 선곡회의
				</div>
			</div>

			{/* 2. 메인 히어로 배너 섹션 */}
			<div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card/95 to-primary/5 p-6 sm:p-8 shadow-sm">
				<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
					<div className="space-y-3 max-w-2xl">
						<div className="flex flex-wrap items-center gap-2">
							{timeLeft.isOver && (
								<Badge
									variant="secondary"
									className="text-xs font-bold gap-1 px-2.5 py-0.5"
								>
									<Lock className="size-3" /> 추천 마감
								</Badge>
							)}

							{currentPerformer && (
								<Badge
									variant="outline"
									className="text-xs font-bold px-2.5 py-0.5 bg-primary/5 border-primary/20 text-primary flex items-center gap-1"
								>
									<Sparkles className="size-3 text-primary" />
									내 참여 세션: {currentPerformer.part}
								</Badge>
							)}
						</div>

						<h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
							{dDay && (
								<Badge className="bg-primary text-primary-foreground text-xs font-black tracking-wider px-2.5 py-0.5">
									{dDay}
								</Badge>
							)}
							<span>{gigInfo?.title} 선곡회의</span>
						</h1>

						<div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs sm:text-sm text-muted-foreground">
							{gigInfo?.performDate && (
								<span className="flex items-center gap-1">
									<Calendar className="size-3.5 text-primary" />
									공연일: {formatDateKorean(gigInfo.performDate)}
								</span>
							)}
							{gigInfo?.meetingDate && (
								<span className="flex items-center gap-1">
									<AlarmClock className="size-3.5 text-primary" />
									선곡회의: {formatDateKorean(gigInfo.meetingDate)}
								</span>
							)}
							{gigInfo?.location && (
								<span className="flex items-center gap-1">
									<MapPin className="size-3.5 text-primary" />
									{gigInfo.location}
								</span>
							)}
						</div>
					</div>

					{/* 마감 카운트다운 및 곡 추천 액션 박스 */}
					<div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
						<div className="p-3.5 px-4 rounded-2xl bg-muted/40 border border-border/80 flex items-center justify-between sm:justify-start gap-3 text-xs">
							<div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
								<AlarmClock className="size-4" />
							</div>
							<div className="text-left">
								<div className="text-[11px] text-muted-foreground font-medium">
									{timeLeft.isOver ? "추천 마감 완료" : "후보곡 추천 마감까지"}
								</div>
								<div className="font-extrabold text-foreground text-sm">
									{timeLeft.isOver ? (
										<span className="text-muted-foreground">접수가 마감되었습니다</span>
									) : (
										<span>
											{timeLeft.dd > 0 ? `${timeLeft.dd}일 ` : ""}
											{timeLeft.hh}시간 {timeLeft.mm}분 남음
										</span>
									)}
								</div>
							</div>
						</div>

						<Link
							href={`/gigs/${gigId}/nominations/new`}
							className="hidden sm:inline-flex"
						>
							<Button
								size="lg"
								disabled={!canRecommend}
								className="font-bold shadow-sm hover:shadow-md transition-all h-11 px-6 text-sm"
								title={recommendationTitle}
							>
								<Plus className="size-4 mr-1.5" />
								후보곡 추천하기
							</Button>
						</Link>
					</div>
				</div>
			</div>

			{/* 3. 검색, 변경 사항 알림 및 필터 툴바 */}
			<div className="flex flex-col gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-2xs">
				{/* 마지막 조회 이후 변경 사항 안내 배너 (있는 경우) */}
				{changedCount > 0 && (
					<div className="flex flex-wrap items-center justify-between gap-2 p-2.5 px-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-300">
						<div className="flex items-center gap-2 min-w-0 font-medium">
							<span className="size-2 rounded-full bg-amber-500 animate-ping shrink-0" />
							<span className="truncate">
								마지막 확인 이후 <strong>{changedCount}곡</strong>의 신규 등록 또는 수정 사항이 있습니다.
							</span>
						</div>

						<div className="flex items-center gap-2 shrink-0 ml-auto">
							<Button
								variant={onlyChangedFilter ? "default" : "outline"}
								size="sm"
								onClick={() => setOnlyChangedFilter((prev) => !prev)}
								className={cn(
									"h-7 px-2.5 text-xs font-bold gap-1",
									onlyChangedFilter
										? "bg-amber-600 hover:bg-amber-700 text-white border-transparent"
										: "border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15",
								)}
							>
								<Sparkles className="size-3" />
								{onlyChangedFilter ? "전체 보기" : "변경된 곡만 보기"}
							</Button>

							<Button
								variant="ghost"
								size="sm"
								onClick={handleMarkAllAsViewed}
								className="h-7 px-2.5 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 gap-1"
							>
								<CheckCheck className="size-3.5" />
								모두 확인 완료
							</Button>
						</div>
					</div>
				)}

				{/* 상단 검색창 및 필터 토글 버튼 */}
				<div className="flex items-center gap-2">
					<div className="relative flex-1">
						<Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
						<Input
							placeholder="곡 제목, 아티스트, 추천자 검색..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9 pr-8 h-9 text-xs"
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery("")}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								<X className="size-3.5" />
							</button>
						)}
					</div>

					{/* 필터 토글 버튼 (세션, 응답, 악보) */}
					<Button
						variant={isFilterOpen || activeFilterCount > 0 ? "secondary" : "outline"}
						size="sm"
						onClick={() => setIsFilterOpen((prev) => !prev)}
						className={cn(
							"h-9 px-3 text-xs font-semibold gap-1.5 shrink-0 transition-colors",
							activeFilterCount > 0 &&
								"border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
							isFilterOpen && "ring-1 ring-primary/30",
						)}
					>
						<Filter className="size-3.5" />
						<span>필터</span>
						{activeFilterCount > 0 && (
							<span className="flex items-center justify-center size-4 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
								{activeFilterCount}
							</span>
						)}
						<ChevronDown
							className={cn(
								"size-3 text-muted-foreground transition-transform duration-200",
								isFilterOpen && "rotate-180",
							)}
						/>
					</Button>
				</div>

				{/* 필터 확장 패널 (세션, 응답, 악보 3가지 필터) */}
				{isFilterOpen && (
					<div className="pt-3 border-t border-border/70 flex flex-col gap-3.5 animate-in fade-in-50 duration-150">
						{/* 1. 세션 파트 필터 */}
						<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
							<span className="text-[11px] font-bold text-muted-foreground shrink-0 w-12">
								세션:
							</span>
							<div className="flex flex-wrap items-center gap-1.5">
								<Badge
									variant={partFilter === "all" ? "default" : "outline"}
									onClick={() => setPartFilter("all")}
									className="cursor-pointer font-semibold text-xs py-1 px-2.5 transition-colors"
								>
									전체
								</Badge>
								{SESSION_FILTER_PARTS.map((part) => (
									<Badge
										key={part}
										variant={partFilter === part ? "default" : "outline"}
										onClick={() => setPartFilter(part)}
										className="cursor-pointer font-semibold text-xs py-1 px-2.5 transition-colors"
									>
										{part}
									</Badge>
								))}
							</div>
						</div>

						{/* 2. 내 응답 필터 */}
						{currentUser && (
							<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
								<span className="text-[11px] font-bold text-muted-foreground shrink-0 w-12">
									응답:
								</span>
								<div className="flex items-center p-0.5 bg-muted rounded-lg border border-border/80 text-xs w-fit">
									<button
										type="button"
										onClick={() => setResponseFilter("all")}
										className={cn(
											"px-2.5 py-1 rounded-md font-medium transition-all",
											responseFilter === "all"
												? "bg-background text-foreground shadow-2xs font-bold"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										전체
									</button>
									<button
										type="button"
										onClick={() => setResponseFilter("available")}
										className={cn(
											"px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
											responseFilter === "available"
												? "bg-background text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										<span className="size-1.5 rounded-full bg-emerald-500" />
										가능
									</button>
									<button
										type="button"
										onClick={() => setResponseFilter("unavailable")}
										className={cn(
											"px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
											responseFilter === "unavailable"
												? "bg-background text-rose-600 dark:text-rose-400 shadow-2xs font-bold"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										<span className="size-1.5 rounded-full bg-rose-500" />
										불가능
									</button>
									<button
										type="button"
										onClick={() => setResponseFilter("undecided")}
										className={cn(
											"px-2.5 py-1 rounded-md font-medium transition-all",
											responseFilter === "undecided"
												? "bg-background text-foreground shadow-2xs font-bold"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										미선택
									</button>
								</div>
							</div>
						)}

						{/* 3. 악보 필터 */}
						<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
							<span className="text-[11px] font-bold text-muted-foreground shrink-0 w-12">
								악보:
							</span>
							<div className="flex items-center p-0.5 bg-muted rounded-lg border border-border/80 text-xs w-fit">
								<button
									type="button"
									onClick={() => setSheetFilter("all")}
									className={cn(
										"px-2.5 py-1 rounded-md font-medium transition-all",
										sheetFilter === "all"
											? "bg-background text-foreground shadow-2xs font-bold"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									전체
								</button>
								<button
									type="button"
									onClick={() => setSheetFilter("has_sheet")}
									className={cn(
										"px-2.5 py-1 rounded-md font-medium transition-all",
										sheetFilter === "has_sheet"
											? "bg-background text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									악보 있음
								</button>
								<button
									type="button"
									onClick={() => setSheetFilter("no_sheet")}
									className={cn(
										"px-2.5 py-1 rounded-md font-medium transition-all",
										sheetFilter === "no_sheet"
											? "bg-background text-foreground shadow-2xs font-bold"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									악보 없음
								</button>
							</div>

							{activeFilterCount > 0 && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setPartFilter("all");
										setResponseFilter("all");
										setSheetFilter("all");
									}}
									className="h-7 text-[11px] text-muted-foreground hover:text-foreground px-2 sm:ml-auto w-fit gap-1"
								>
									<RotateCcw className="size-3" />
									필터 초기화
								</Button>
							)}
						</div>
					</div>
				)}

				{/* 필터가 접혀있을 때 활성화된 필터 뱃지 요약 */}
				{!isFilterOpen && activeFilterCount > 0 && (
					<div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40 text-xs">
						<span className="text-[11px] text-muted-foreground font-medium">적용된 필터:</span>
						{partFilter !== "all" && (
							<Badge variant="secondary" className="gap-1 text-[11px] font-semibold py-0.5">
								세션: {partFilter}
								<X
									className="size-3 cursor-pointer hover:text-destructive"
									onClick={() => setPartFilter("all")}
								/>
							</Badge>
						)}
						{responseFilter !== "all" && (
							<Badge variant="secondary" className="gap-1 text-[11px] font-semibold py-0.5">
								응답: {responseFilter === "available" ? "가능" : responseFilter === "unavailable" ? "불가능" : "미선택"}
								<X
									className="size-3 cursor-pointer hover:text-destructive"
									onClick={() => setResponseFilter("all")}
								/>
							</Badge>
						)}
						{sheetFilter !== "all" && (
							<Badge variant="secondary" className="gap-1 text-[11px] font-semibold py-0.5">
								악보: {sheetFilter === "has_sheet" ? "악보 있음" : "악보 없음"}
								<X
									className="size-3 cursor-pointer hover:text-destructive"
									onClick={() => setSheetFilter("all")}
								/>
							</Badge>
						)}
						<button
							type="button"
							onClick={() => {
								setPartFilter("all");
								setResponseFilter("all");
								setSheetFilter("all");
							}}
							className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1 cursor-pointer"
						>
							전체 해제
						</button>
					</div>
				)}
			</div>

			{/* 5. 곡 목록 카드 섹션 */}
			<section className="flex flex-col gap-3">
				{filteredSongs.length === 0 ? (
					songs.length === 0 ? (
						/* 완전 빈 상태 */
						<div className="flex flex-col items-center justify-center p-12 sm:p-16 border-2 border-dashed border-border/80 rounded-3xl bg-muted/10 text-center gap-4">
							<div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
								<Music2 className="size-8" />
							</div>
							<div className="space-y-1.5 max-w-sm">
								<h3 className="text-base font-bold text-foreground">
									아직 추천된 후보곡이 없습니다
								</h3>
								<p className="text-xs text-muted-foreground">
									이번 공연 무대에서 함께 연주하고 싶은 명곡을 가장 먼저
									추천해보세요!
								</p>
							</div>
							<Link
								href={`/gigs/${gigId}/nominations/new`}
								className="hidden sm:inline-flex"
							>
								<Button
									disabled={!canRecommend}
									className="mt-2 text-xs font-bold"
									title={recommendationTitle}
								>
									<Plus className="size-4 mr-1" /> 첫 번째 곡 추천하기
								</Button>
							</Link>
						</div>
					) : (
						/* 검색 결과 없음 */
						<div className="flex flex-col items-center justify-center p-10 border border-border/80 rounded-2xl bg-card text-center gap-3">
							<p className="text-sm font-semibold text-muted-foreground">
								검색 조건에 맞는 곡이 없습니다.
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setSearchQuery("");
									setSheetFilter("all");
									setPartFilter("all");
									setResponseFilter("all");
									setOnlyChangedFilter(false);
								}}
								className="text-xs"
							>
								전체 곡 보기
							</Button>
						</div>
					)
				) : (
					filteredSongs.map((song, idx) => {
						const highlightState = getSongHighlightState(song);
						return (
							<div
								key={song.id}
								onClick={() => {
									// 상세 서랍 열람 시 해당 곡을 확인 완료로 표시
									setViewedSongIds((prev) => new Set([...prev, song.id]));
									setSelectedSong(song);
								}}
								className="cursor-pointer focus:outline-none"
								role="button"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										setViewedSongIds((prev) => new Set([...prev, song.id]));
										setSelectedSong(song);
									}
								}}
							>
								<NominationCard
									song={song}
									index={idx + 1}
									highlightState={highlightState}
									currentUserId={currentUser?.id}
									isCurrentUserPerformer={Boolean(currentPerformer)}
								/>
							</div>
						);
					})
				)}
			</section>

			{/* 모바일 후보곡 추천 플로팅 버튼 */}
			{canRecommend ? (
				<Button
					asChild
					size="icon"
					className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 size-14 rounded-full shadow-xl sm:hidden"
				>
					<Link
						href={`/gigs/${gigId}/nominations/new`}
						aria-label="후보곡 추천하기"
						title={recommendationTitle}
					>
						<Plus className="size-6" />
						<span className="sr-only">후보곡 추천하기</span>
					</Link>
				</Button>
			) : (
				<Button
					type="button"
					size="icon"
					disabled
					aria-label={recommendationTitle}
					title={recommendationTitle}
					className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 size-14 rounded-full shadow-xl sm:hidden"
				>
					<Plus className="size-6" />
				</Button>
			)}

			{/* 6. 상세 슬라이드 오버 서랍 */}
			<NominationDrawer
				song={selectedSong}
				currentUserId={currentUser?.id}
				isAdmin={isAdmin}
				canEdit={Boolean(
					selectedSong &&
						(isAdmin ||
							(currentUser &&
								selectedSong.createdBy?.userId === currentUser.id) ||
							(currentPerformer &&
								selectedSong.createdBy?.performerId === currentPerformer.id)),
				)}
				canRespond={Boolean(currentPerformer || isAdmin)}
				performers={performers}
				onEdit={(song) => {
					setSelectedSong(null);
					router.push(`/gigs/${gigId}/nominations/${song.id}/edit`);
				}}
				onClose={() => setSelectedSong(null)}
				onSongUpdated={(updatedSong) => {
					setSelectedSong(updatedSong);
					setSongs((prev) =>
						prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)),
					);
				}}
			/>
		</div>
	);
}

/**
 * 후보곡 개별 카드 컴포넌트
 */
function NominationCard({
	song,
	index,
	highlightState,
	currentUserId,
	isCurrentUserPerformer,
}: {
	song: Nomination & {
		createdBy?: { name: string; part: string; generation: number | null } | null;
	};
	index: number;
	highlightState?: "new" | "updated" | null;
	currentUserId?: string | null;
	isCurrentUserPerformer: boolean;
}) {
	const partCounts = useMemo(() => {
		return (song.requiredParts || []).reduce(
			(acc, p) => {
				acc[p] = (acc[p] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);
	}, [song.requiredParts]);

	const uniqueParts = useMemo(
		() => sortSessionParts(Array.from(new Set(song.requiredParts || []))),
		[song.requiredParts],
	);

	const mySessionResponses = useMemo(() => {
		if (!isCurrentUserPerformer || !currentUserId || !song.responses) return [];

		const responseByPart = new Map(
			song.responses
				.filter(
					(response) =>
						response.userId === currentUserId &&
						uniqueParts.includes(response.sessionPart),
				)
				.map((response) => [response.sessionPart, response]),
		);

		return uniqueParts.flatMap((part) => {
			const response = responseByPart.get(part);
			return response ? [response] : [];
		});
	}, [song.responses, uniqueParts, currentUserId, isCurrentUserPerformer]);

	// 첫 번째 유튜브 링크 썸네일 확인
	const youtubeVideoId = useMemo(() => {
		if (!song.links) return null;
		for (const l of song.links) {
			const id = getYouTubeVideoId(l.url);
			if (id) return id;
		}
		return null;
	}, [song.links]);

	const thumbnailUrl = getYouTubeThumbnailUrl(youtubeVideoId);

	return (
		<Card
			className={cn(
				"group relative overflow-hidden border transition-all duration-200",
				highlightState === "new"
					? "border-emerald-500/60 dark:border-emerald-500/70 ring-1 ring-emerald-500/25 bg-emerald-500/[0.03] shadow-xs"
					: highlightState === "updated"
						? "border-amber-500/60 dark:border-amber-500/70 ring-1 ring-amber-500/25 bg-amber-500/[0.03] shadow-xs"
						: "border-border/80 bg-card hover:bg-muted/30 hover:border-primary/50 hover:shadow-md",
			)}
		>
			{/* 좌측 하이라이트 인디케이터 바 */}
			{highlightState === "new" && (
				<div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
			)}
			{highlightState === "updated" && (
				<div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500" />
			)}

			<CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pl-5 sm:pl-6">
				{/* 썸네일 아트워크 영역 (유튜브 16:9 기본 비율 적용) */}
				<div className="relative shrink-0 w-full sm:w-36 aspect-video rounded-xl overflow-hidden bg-muted/60 border border-border/60 flex items-center justify-center">
					{thumbnailUrl ? (
						<img
							src={thumbnailUrl}
							alt={song.title}
							className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
						/>
					) : (
						<div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted to-accent/30 flex flex-col items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
							<Disc3 className="size-7 opacity-70 group-hover:rotate-45 transition-transform duration-500" />
							<span className="text-[10px] font-bold mt-1 text-muted-foreground/80">
								#{index}
							</span>
						</div>
					)}
				</div>

				{/* 메인 정보 영역 */}
				<div className="flex-1 min-w-0 space-y-2 text-left">
					{/* 1행: 곡 제목 - 아티스트 | 상세보기 */}
					<div className="flex items-start justify-between gap-3">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<h3 className="truncate text-base font-black text-foreground transition-colors group-hover:text-primary sm:text-lg">
								{song.title}
							</h3>
							{song.artist && (
								<span className="truncate text-xs font-semibold text-muted-foreground sm:text-sm">
									— {song.artist}
								</span>
							)}
							{highlightState === "new" && (
								<Badge className="h-5 gap-1 bg-emerald-500 px-2 py-0 text-[10px] font-extrabold tracking-wide text-white shadow-xs hover:bg-emerald-600">
									<Sparkles className="size-2.5" /> 신규
								</Badge>
							)}
							{highlightState === "updated" && (
								<Badge className="h-5 gap-1 bg-amber-500 px-2 py-0 text-[10px] font-extrabold tracking-wide text-white shadow-xs hover:bg-amber-600">
									<Sparkles className="size-2.5" /> 수정됨
								</Badge>
							)}
						</div>
						<div className="hidden shrink-0 items-center text-xs font-semibold text-primary opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 sm:inline-flex">
							<span>상세보기</span>
							<ChevronRight className="ml-0.5 size-3.5" />
						</div>
					</div>

					{/* 2행: 필요 세션 | 나의 응답 */}
					<div className="flex items-start justify-between gap-3">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
							{uniqueParts.length > 0 ? (
								uniqueParts.map((part) => (
									<div
										key={part}
										className="flex h-6 items-center gap-1 rounded-lg border border-border/70 bg-muted/60 px-2 text-[11px] font-medium text-foreground transition-colors"
									>
										<span>{part}</span>
										<span className="font-extrabold text-primary">{partCounts[part]}</span>
									</div>
								))
							) : (
								<span className="text-[11px] text-muted-foreground">세션 조율 중</span>
							)}
							<span
								className={cn(
									"shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold",
									song.sheetExists
										? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
										: "border-border/70 bg-muted text-muted-foreground",
								)}
							>
								<span className="sm:hidden">악보 {song.sheetExists ? "O" : "X"}</span>
								<span className="hidden sm:inline">악보 {song.sheetExists ? "있음" : "없음"}</span>
							</span>
						</div>

						{isCurrentUserPerformer && (
							<div
								className="flex max-w-[48%] shrink-0 flex-wrap items-center justify-end gap-1"
								aria-label="나의 응답"
							>
								{mySessionResponses.length > 0 ? (
									mySessionResponses.map((response) => (
										<Badge
											key={response.sessionPart}
											variant="outline"
											className={cn(
												"h-5 shrink-0 px-1.5 py-0 text-[10px] font-bold",
												response.status === "available"
													? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
													: response.status === "unavailable"
														? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
														: "border-border/70 bg-muted text-muted-foreground",
											)}
										>
											{response.sessionPart}{" "}
											{response.status === "available"
												? "가능"
												: response.status === "unavailable"
													? "불가능"
													: "미응답"}
										</Badge>
									))
								) : (
									<Badge
										variant="outline"
										className="h-5 shrink-0 border-border/70 bg-muted px-1.5 py-0 text-[10px] font-bold text-muted-foreground"
									>
										내 응답 미선택
									</Badge>
								)}
							</div>
						)}
					</div>

					{/* 3행: 어필 | 작성자 */}
					<div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
						{song.description ? (
							<span className="min-w-0 flex-1 truncate">{song.description}</span>
						) : (
							<span className="min-w-0 flex-1" />
						)}
						<span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
							{song.createdBy?.generation ? `${song.createdBy.generation}기 ` : ""}
							<span className="font-bold text-foreground">
								{song.createdBy?.name || "동아리 부원"}
							</span>
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export const SetlistPanel = NominationPanel;
export type SetlistPanelProps = NominationPanelProps;
