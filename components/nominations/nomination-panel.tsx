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
import { useParams } from "next/navigation";
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
	type NominationResponseStatus,
	parseNomination,
	NominationFormValues,
	getYouTubeVideoId,
	getYouTubeThumbnailUrl,
	isMaleVocalPart,
	isFemaleVocalPart,
	extractYouTubeTimestamp,
	formatSecondsToTime,
	sortSessionParts,
} from "@/lib/nomination";
import { NominationDrawer } from "@/components/nominations/nomination-drawer";
import { NominationNewModal } from "@/components/nominations/nomination-new-modal";
import { NominationEditModal } from "@/components/nominations/nomination-edit-modal";
import {
	addNomination,
	deleteNomination,
	updateNomination,
	updateNominationViewAction,
} from "@/app/gigs/[id]/nominations/actions";
import { toast } from "sonner";
import { cn, getDDay } from "@/lib/utils";
import {
	LeaveConfirmDialog,
	useUnsavedChangesWarning,
} from "@/components/ui/leave-confirm-dialog";

const DEADLINE_COLUMN = "meeting_date";
const DEFAULT_REQUIRED_PARTS = ["보컬(남)", "기타", "베이스", "드럼", "건반"];
const SESSION_FILTER_PARTS = [
	"보컬(남)",
	"보컬(여)",
	"건반",
];
const DEFAULT_FORM_STATE: NominationFormValues = {
	title: "",
	artist: "",
	requiredParts: [...DEFAULT_REQUIRED_PARTS],
	recommendedVocals: [],
	sheetExists: false,
	description: "",
	links: [],
};

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
	const gigId = params.id as string;
	const dialogRef = useRef<HTMLDialogElement>(null);
	const supabase = createClient();

	const [isPending, startTransition] = useTransition();
	const [isEditPending, startEditTransition] = useTransition();
	const [songs, setSongs] = useState<Nomination[]>([]);
	const [selectedSong, setSelectedSong] = useState<Nomination | null>(null);
	const [editingSong, setEditingSong] = useState<Nomination | null>(null);
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

	const [form, setForm] = useState(DEFAULT_FORM_STATE);
	const [newPart, setNewPart] = useState("");

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
									user_id,
									part,
									...users (
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
					if (perfRow) setCurrentPerformer(perfRow);

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

	const handleDeleteSong = async (songId: number) => {
		try {
			await deleteNomination(gigId, songId);
			setSongs((prev) => prev.filter((s) => s.id !== songId));
			setSelectedSong(null);
			setEditingSong(null);
			toast.success("곡이 성공적으로 삭제되었습니다.");
		} catch (error: unknown) {
			console.error("곡 삭제 실패:", error);
			const message = error instanceof Error ? error.message : "곡 삭제 중 오류가 발생했습니다.";
			toast.error(message);
		}
	};

	const handleUpdateSong = async (
		songId: number,
		formValues: NominationFormValues,
	) => {
		startEditTransition(async () => {
			try {
				await updateNomination(gigId, songId, formValues);
				// 로컬 상태 동기화
				const updatedFields = {
					title: formValues.title,
					artist: formValues.artist,
					requiredParts: formValues.requiredParts,
					recommendedVocals: formValues.recommendedVocals,
					sheetExists: formValues.sheetExists,
					description: formValues.description,
					links: formValues.links,
					updatedAt: new Date().toISOString(),
				};

				setSongs((prev) =>
					prev.map((s) => (s.id === songId ? { ...s, ...updatedFields } : s)),
				);

				if (selectedSong?.id === songId) {
					setSelectedSong((prev) => (prev ? { ...prev, ...updatedFields } : null));
				}

				setEditingSong(null);
				toast.success("곡 정보가 성공적으로 수정되었습니다.");
			} catch (error: unknown) {
				console.error("곡 수정 실패:", error);
				const message = error instanceof Error ? error.message : "곡 수정 중 오류가 발생했습니다.";
				toast.error(message);
			}
		});
	};

	useEffect(() => {
		if (!gigInfo?.meetingDate) return;
		const timer = setInterval(
			() => setTimeLeft(getRemainingTime(gigInfo.meetingDate)),
			60000,
		);
		return () => clearInterval(timer);
	}, [gigInfo?.meetingDate]);

	const resetForm = useCallback(() => {
		setForm(DEFAULT_FORM_STATE);
		setNewPart("");
	}, []);

	const updateRef = (
		idx: number,
		field: "url" | "note" | "timestamp",
		val: string,
	) => {
		setForm((prev) => {
			const nextLinks = [...prev.links];
			const existing = nextLinks[idx] || { url: "", note: "", timestamp: "" };
			const updated = { ...existing, [field]: val };
			// URL에 타임스탬프 파라미터가 있고 구간 필드가 비어있다면 자동 입력
			if (field === "url" && !updated.timestamp) {
				const sec = extractYouTubeTimestamp(val);
				if (sec !== null) {
					updated.timestamp = formatSecondsToTime(sec);
				}
			}
			nextLinks[idx] = updated;
			return { ...prev, links: nextLinks };
		});
	};

	const isModalDirty = Boolean(
		form.title.trim() ||
			form.artist?.trim() ||
			form.description?.trim() ||
			form.links.some((l) => l.url.trim() || l.note?.trim()),
	);

	const {
		showLeaveModal,
		cancelLeave,
		confirmLeave,
		triggerConfirm,
		markSubmitting,
	} = useUnsavedChangesWarning({
		isDirty: isModalDirty,
	});

	const closeDialog = () => {
		triggerConfirm(() => {
			dialogRef.current?.close();
			resetForm();
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		startTransition(async () => {
			try {
				await addNomination(gigId, form);
				markSubmitting();
				dialogRef.current?.close();
				resetForm();
				toast.success("후보곡이 등록되었습니다!");
				window.location.reload();
			} catch (e) {
				toast.error("저장에 실패했습니다: " + (e as Error).message);
			}
		});
	};

	const openDialog = () => {
		resetForm();
		dialogRef.current?.showModal();
	};

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
							{dDay && (
								<Badge className="bg-primary text-primary-foreground text-xs font-black tracking-wider px-2.5 py-0.5">
									{dDay}
								</Badge>
							)}

							{timeLeft.isOver ? (
								<Badge
									variant="secondary"
									className="text-xs font-bold gap-1 px-2.5 py-0.5"
								>
									<Lock className="size-3" /> 추천 마감
								</Badge>
							) : (
								<Badge
									variant="outline"
									className="text-xs font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1 px-2.5 py-0.5"
								>
									<span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
									선곡 회의 진행 중
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
							<Disc3 className="size-7 text-primary animate-spin-slow" />
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

						<Button
							onClick={openDialog}
							size="lg"
							disabled={!isAdmin && (timeLeft.isOver || !currentPerformer)}
							className="font-bold shadow-sm hover:shadow-md transition-all h-11 px-6 text-sm"
							title={
								isAdmin && timeLeft.isOver
									? "선곡회의가 마감되었으나 관리자 권한으로 후보곡을 추천할 수 있습니다."
									: !isAdmin && timeLeft.isOver
										? "선곡회의 접수가 마감되었습니다."
										: !isAdmin && !currentPerformer
											? "공연 참여자만 후보곡을 추천할 수 있습니다."
											: undefined
							}
						>
							<Plus className="size-4 mr-1.5" />
							후보곡 추천하기
						</Button>
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
							<Button
								onClick={openDialog}
								disabled={!isAdmin && (timeLeft.isOver || !currentPerformer)}
								className="mt-2 text-xs font-bold"
								title={
									isAdmin && timeLeft.isOver
										? "선곡회의가 마감되었으나 관리자 권한으로 후보곡을 추천할 수 있습니다."
										: !isAdmin && timeLeft.isOver
											? "선곡회의 접수가 마감되었습니다."
											: !isAdmin && !currentPerformer
												? "공연 참여자만 후보곡을 추천할 수 있습니다."
												: undefined
								}
							>
								<Plus className="size-4 mr-1" /> 첫 번째 곡 추천하기
							</Button>
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
								/>
							</div>
						);
					})
				)}
			</section>

			{/* 6. 곡 등록 모달 */}
			<NominationNewModal
				ref={dialogRef}
				form={form}
				setForm={setForm}
				parts={form.requiredParts}
				setParts={(newParts) =>
					setForm((prev) => ({
						...prev,
						requiredParts:
							typeof newParts === "function"
								? newParts(prev.requiredParts)
								: newParts,
					}))
				}
				refs={form.links}
				updateRef={updateRef}
				performers={performers}
				newPart={newPart}
				setNewPart={setNewPart}
				isPending={isPending}
				onSubmit={handleSubmit}
				onClose={closeDialog}
			/>

			{/* 7. 상세 슬라이드 오버 서랍 */}
			<NominationDrawer
				song={selectedSong}
				currentUserId={currentUser?.id}
				isAdmin={isAdmin}
				canEdit={Boolean(
					selectedSong &&
						(isAdmin ||
							(currentUser &&
								selectedSong.createdBy?.userId === currentUser.id)),
				)}
				canRespond={Boolean(currentPerformer || isAdmin)}
				performers={performers}
				onEdit={(song) => setEditingSong(song)}
				onClose={() => setSelectedSong(null)}
				onSongUpdated={(updatedSong) => {
					setSelectedSong(updatedSong);
					setSongs((prev) =>
						prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)),
					);
				}}
			/>

			{/* 8. 곡 정보 수정 및 삭제 모달 */}
			<NominationEditModal
				song={editingSong}
				isOpen={Boolean(editingSong)}
				isPending={isEditPending}
				canDelete={Boolean(
					editingSong &&
						(isAdmin ||
							(currentUser &&
								editingSong.createdBy?.userId === currentUser.id)),
				)}
				performers={performers}
				onClose={() => setEditingSong(null)}
				onSubmit={handleUpdateSong}
				onDelete={handleDeleteSong}
			/>

			{/* 곡 등록 중 이탈 방지 경고 팝업 */}
			<LeaveConfirmDialog
				isOpen={showLeaveModal}
				onClose={cancelLeave}
				onConfirm={confirmLeave}
				title="곡 추천 작성을 취소하시겠습니까?"
				description="작성 중인 곡 정보가 저장되지 않았습니다. 창을 닫거나 페이지를 벗어나면 입력 내용이 모두 사라집니다."
				confirmText="나가기 (저장 안 함)"
				cancelText="계속 작성하기"
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
}: {
	song: Nomination & {
		createdBy?: { name: string; part: string; generation: number } | null;
	};
	index: number;
	highlightState?: "new" | "updated" | null;
	currentUserId?: string | null;
}) {
	// 세션원 응답 요약 통계 (현재 곡의 requiredParts에 속한 유효 세션만 집계)
	const responseSummary = useMemo(() => {
		if (!song.responses || song.responses.length === 0) return null;
		let available = 0;
		let unavailable = 0;
		let myStatus: NominationResponseStatus | null = null;

		const activeResponses = song.responses.filter(
			(r) => !song.requiredParts || song.requiredParts.length === 0 || song.requiredParts.includes(r.sessionPart),
		);

		activeResponses.forEach((r) => {
			if (r.status === "available") available++;
			if (r.status === "unavailable") unavailable++;
			if (currentUserId && r.userId === currentUserId) {
				if (!myStatus || r.status === "available") {
					myStatus = r.status;
				}
			}
		});

		return {
			available,
			unavailable,
			myStatus,
		};
	}, [song.responses, song.requiredParts, currentUserId]);

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
				{/* 썸네일 아트워크 영역 (play 아이콘 없이 썸네일 그대로 표시) */}
				<div className="relative shrink-0 w-full sm:w-28 sm:h-20 h-32 rounded-xl overflow-hidden bg-muted/60 border border-border/60 flex items-center justify-center">
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
					{/* 1행: 타이틀 & 하이라이트 뱃지 & 악보 상태 */}
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="text-base sm:text-lg font-black text-foreground truncate group-hover:text-primary transition-colors">
									{song.title}
								</h3>
								{song.artist && (
									<span className="text-xs sm:text-sm text-muted-foreground font-semibold truncate">
										— {song.artist}
									</span>
								)}

								{/* 하이라이트 뱃지 */}
								{highlightState === "new" && (
									<Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-0 h-5 gap-1 tracking-wide shadow-xs">
										<Sparkles className="size-2.5" />
										신규
									</Badge>
								)}
								{highlightState === "updated" && (
									<Badge className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] px-2 py-0 h-5 gap-1 tracking-wide shadow-xs">
										<Sparkles className="size-2.5" />
										수정됨
									</Badge>
								)}
							</div>
						</div>

						{/* 악보 상태 뱃지 */}
						<span
							className={cn(
								"text-[11px] font-bold shrink-0 px-2 py-0.5 rounded-md border",
								song.sheetExists
									? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
									: "text-muted-foreground bg-muted border-border/70",
							)}
						>
							악보 {song.sheetExists ? "보유" : "미보유"}
						</span>
					</div>

					{/* 2행: 세션 파트 구성 칩 (보컬 > 코러스 > 기타 > 베이스 > 드럼 > 건반 > 이외 순서 정렬) */}
					<div className="flex flex-wrap items-center gap-1.5">
						{uniqueParts.length > 0 ? (
							uniqueParts.map((part) => (
								<div
									key={part}
									className="flex items-center rounded-lg h-6 px-2 gap-1 border text-[11px] font-medium transition-colors bg-muted/60 text-foreground border-border/70"
								>
									<span>{part}</span>
									<span className="font-extrabold text-primary">
										{partCounts[part]}
									</span>
								</div>
							))
						) : (
							<span className="text-[11px] text-muted-foreground">
								세션 조율 중
							</span>
						)}
					</div>

					{/* 3행: 세션원 참여 응답 요약 뱃지 (있을 때만 노출) */}
					{responseSummary && (responseSummary.available > 0 || responseSummary.unavailable > 0 || (responseSummary.myStatus && responseSummary.myStatus !== "undecided")) && (
						<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
							{responseSummary.available > 0 && (
								<span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
									<span className="size-1.5 rounded-full bg-emerald-500" />
									가능 {responseSummary.available}명
								</span>
							)}
							{responseSummary.unavailable > 0 && (
								<span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
									<span className="size-1.5 rounded-full bg-rose-500" />
									불가능 {responseSummary.unavailable}명
								</span>
							)}
							{responseSummary.myStatus && responseSummary.myStatus !== "undecided" && (
								<Badge
									variant="outline"
									className={cn(
										"text-[10px] font-bold px-1.5 py-0 h-5 ml-auto sm:ml-0",
										responseSummary.myStatus === "available"
											? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
											: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
									)}
								>
									내 응답: {responseSummary.myStatus === "available" ? "가능" : "불가능"}
								</Badge>
							)}
						</div>
					)}

					{/* 4행: 추천 사유 한 줄 어필 (쌍따옴표, 이탤릭체 제거) */}
					{song.description && (
						<p className="text-xs text-muted-foreground truncate">
							{song.description}
						</p>
					)}
				</div>

				{/* 우측 메타: 추천자 정보 및 상세 화살표 */}
				<div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/60">
					<div className="text-[11px] font-medium text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-lg border border-border/60">
						{song.createdBy ? (
							<>
								<span className="text-muted-foreground mr-1">
									{song.createdBy.generation}기
								</span>
								<span className="font-bold text-foreground">
									{song.createdBy.name}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">동아리 부원</span>
						)}
					</div>

					<div className="hidden sm:flex items-center text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
						<span>상세보기</span>
						<ChevronRight className="size-3.5 ml-0.5" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export const SetlistPanel = NominationPanel;
export type SetlistPanelProps = NominationPanelProps;

