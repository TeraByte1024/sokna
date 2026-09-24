"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
	Nomination,
	getYouTubeVideoId,
	isPerformerMatchingSessionPart,
	isLocalCustomSession,
	extractYouTubeTimestamp,
	parseTimestampToSeconds,
	formatSecondsToTime,
	stripLeadingZeroTime,
	sortSessionParts,
	parseTimestampsAndRanges,
	type RecommendedVocal,
	type NominationResponseStatus,
	type NominationTimestamp,
} from "@/lib/nomination";
import {
	X,
	Music2,
	User,
	CalendarDays,
	History,
	FileText,
	Quote,
	Layers,
	Play,
	Pencil,
	Link2,
	CheckCircle2,
	HelpCircle,
	XCircle,
	Users,
	MessageSquare,
	Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NominationResponseSection } from "@/components/nominations/nomination-response-section";
import { ExternalLinkCard, detectServiceInfo } from "@/components/nominations/external-link-card";

interface NominationDrawerProps {
	song: Nomination | null;
	currentUserId?: string | null;
	isAdmin?: boolean;
	canEdit?: boolean;
	canRespond?: boolean;
	performers?: RecommendedVocal[];
	onEdit?: (song: Nomination) => void;
	onClose: () => void;
	onSongUpdated?: (updatedSong: Nomination) => void;
}

interface UserInfo {
	generation: number | null;
	name: string;
}

type MediaItem =
	| {
		type: "youtube";
		url: string;
		note?: string;
		timestamp?: string;
		timestamps?: NominationTimestamp[];
		videoId: string;
		originalIndex: number;
	}
	| {
		type: "external";
		url: string;
		note?: string;
		timestamp?: string;
		timestamps?: NominationTimestamp[];
		domain: string;
		originalIndex: number;
	};

interface PerformerResponseItem {
	key: string;
	userId?: string | null;
	name: string;
	generation?: number | null;
	part?: string | null;
	status: NominationResponseStatus;
	comment?: string;
	isMe: boolean;
	isRecommendedVocal?: boolean;
}

function isMatchingVocal(
	candidate: { userId?: string | null; name: string; generation?: number | null; id?: number },
	recommendedVocals: RecommendedVocal[],
): boolean {
	if (!recommendedVocals || recommendedVocals.length === 0) return false;
	return recommendedVocals.some((rec) => {
		if (rec.userId && candidate.userId && rec.userId === candidate.userId) return true;
		if (rec.id && candidate.id && rec.id === candidate.id) return true;
		if (rec.name === candidate.name) {
			if (rec.generation && candidate.generation) {
				return rec.generation === candidate.generation;
			}
			return true;
		}
		return false;
	});
}

/**
 * mm:ss 또는 hh:mm:ss 타임스탬프를 감지하여 클릭 가능한 인터랙티브 버튼으로 렌더링
 */
function FormattedTimestampText({
	text,
	onTimestampClick,
}: {
	text: string;
	onTimestampClick: (seconds: number, rawTimestamp: string) => void;
}) {
	if (!text) return null;
	const regex = /(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{2}))/g;
	const parts: (string | { timestamp: string; seconds: number })[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		const full = match[0];
		const h = match[1] ? parseInt(match[1], 10) : 0;
		const m = parseInt(match[2], 10);
		const s = parseInt(match[3], 10);
		const totalSeconds = h * 3600 + m * 60 + s;
		parts.push({ timestamp: full, seconds: totalSeconds });
		lastIndex = regex.lastIndex;
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return (
		<span>
			{parts.map((part, i) =>
				typeof part === "string" ? (
					part
				) : (
					<button
						key={i}
						type="button"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onTimestampClick(part.seconds, part.timestamp);
						}}
						className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-sans font-semibold tabular-nums bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer align-baseline"
						title={`${part.timestamp} 구간으로 이동`}
					>
						<Play className="size-2.5 fill-current" />
						<span>{part.timestamp}</span>
					</button>
				),
			)}
		</span>
	);
}

/**
 * 텍스트에서 구간 및 타임스탬프 추출 (구간 우선 파싱)
 */
function extractTimestampsFromText(
	text?: string | null,
): { label: string; seconds: number; timestamp: string }[] {
	if (!text) return [];
	const items = parseTimestampsAndRanges(text);
	return items.map((it) => ({
		label: it.label || "",
		seconds: it.startSeconds,
		timestamp: it.raw,
	}));
}

export function NominationDrawer({
	song,
	currentUserId,
	canEdit = false,
	canRespond = false,
	performers = [],
	onEdit,
	onClose,
	onSongUpdated,
}: NominationDrawerProps) {
	const isOpen = Boolean(song);
	const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
	const [activeMediaIdx, setActiveMediaIdx] = useState(0);
	const [activeSeekTime, setActiveSeekTime] = useState<number | null>(null);

	// 공연 정보 셋리스트 여부 (orderNum > 0)
	const isGigSetlist = Boolean(song && song.orderNum > 0);

	// 중복 파트 카운트 및 유니크 파트 추출
	const { uniqueParts, partCounts } = useMemo(() => {
		if (!song?.requiredParts) return { uniqueParts: [], partCounts: {} };

		const counts = song.requiredParts.reduce(
			(acc, p) => {
				acc[p] = (acc[p] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		return {
			uniqueParts: sortSessionParts(Array.from(new Set(song.requiredParts))),
			partCounts: counts,
		};
	}, [song?.requiredParts]);

	// 기본값으로 맨 처음 세션을 선택하여 열어둠
	const [selectedSessionPart, setSelectedSessionPart] = useState<string | null>(
		() => uniqueParts[0] || null,
	);
	const drawerBodyRef = useRef<HTMLDivElement>(null);
	const supabase = createClient();

	// 유튜브 영상 및 일반 외부 링크 통합 추출
	const mediaItems = useMemo<MediaItem[]>(() => {
		if (!song?.links) return [];
		const list: MediaItem[] = [];

		song.links.forEach((link, idx) => {
			const rawUrl = link.url?.trim();
			if (!rawUrl) return;

			const videoId = getYouTubeVideoId(rawUrl);
			if (videoId) {
				list.push({
					type: "youtube",
					url: rawUrl,
					note: link.note,
					timestamp: link.timestamp,
					timestamps: link.timestamps,
					videoId,
					originalIndex: idx,
				});
			} else {
				const { domain } = detectServiceInfo(rawUrl);
				list.push({
					type: "external",
					url: rawUrl,
					note: link.note,
					timestamp: link.timestamp,
					timestamps: link.timestamps,
					domain,
					originalIndex: idx,
				});
			}
		});

		return list;
	}, [song?.links]);

	// 공연 참여자들의 전체 세션 목록
	const allAssignedGigParts = useMemo(() => {
		return performers.flatMap((p) =>
			(p.part || "").split(",").map((s) => s.trim()).filter(Boolean),
		);
	}, [performers]);

	// 선택된 세션 파트에 속하는 참여자 목록 (인라인 표시용)
	const selectedPartMembers = useMemo<PerformerResponseItem[]>(() => {
		if (!selectedSessionPart) return [];

		const isCustom = isLocalCustomSession(selectedSessionPart, allAssignedGigParts);

		const candidatePerformers = isCustom
			? performers
			: performers.filter(
					(p) =>
						isPerformerMatchingSessionPart(p.part, selectedSessionPart) ||
						(selectedSessionPart.includes("보컬") &&
							isMatchingVocal(p, song?.recommendedVocals || [])),
				);

		const members: PerformerResponseItem[] = candidatePerformers.map((p) => {
			const resp = (song?.responses || []).find(
				(r) =>
					r.sessionPart === selectedSessionPart &&
					((r.userId && p.userId && r.userId === p.userId) ||
						(r.user?.name && r.user.name === p.name)),
			);
			const isMe = Boolean(currentUserId && p.userId && p.userId === currentUserId);
			const isRec = isMatchingVocal(p, song?.recommendedVocals || []);
			return {
				key: `performer-${p.id || p.name}-${selectedSessionPart}`,
				userId: p.userId,
				name: p.name,
				generation: p.generation ?? null,
				part: p.part ?? null,
				status: (resp ? resp.status : "undecided") as NominationResponseStatus,
				comment: resp ? resp.comment : "",
				isMe,
				isRecommendedVocal: isRec,
			};
		});

		(song?.responses || [])
			.filter((r) => r.sessionPart === selectedSessionPart)
			.forEach((r) => {
				const alreadyInList = members.some(
					(item) =>
						(item.userId && r.userId && item.userId === r.userId) ||
						item.name === r.user?.name,
				);
				if (!alreadyInList) {
					const isMe = Boolean(currentUserId && r.userId === currentUserId);
					const isRec = isMatchingVocal(
						{
							userId: r.userId,
							name: r.user?.name || "",
							generation: r.user?.generation,
						},
						song?.recommendedVocals || [],
					);
					members.push({
						key: `resp-${r.id}-${selectedSessionPart}`,
						userId: r.userId,
						name: r.user?.name || "참여자",
						generation: r.user?.generation ?? null,
						part: r.user?.part ?? null,
						status: r.status,
						comment: r.comment,
						isMe,
						isRecommendedVocal: isRec,
					});
				}
			});

		// 정렬: 본인 최우선 > 추천 보컬 > 가능 > 미응답 > 불가능
		return members.sort((a, b) => {
			if (a.isMe) return -1;
			if (b.isMe) return 1;
			if (a.isRecommendedVocal && !b.isRecommendedVocal) return -1;
			if (!a.isRecommendedVocal && b.isRecommendedVocal) return 1;
			const order: Record<NominationResponseStatus, number> = {
				available: 1,
				undecided: 2,
				unavailable: 3,
			};
			return (order[a.status] || 99) - (order[b.status] || 99);
		});
	}, [
		performers,
		song?.responses,
		song?.recommendedVocals,
		selectedSessionPart,
		allAssignedGigParts,
		currentUserId,
	]);

	// 선택된 파트의 참여자 응답 통계 계산
	const selectedPartStats = useMemo(() => {
		let available = 0;
		let unavailable = 0;
		let undecided = 0;
		selectedPartMembers.forEach((m) => {
			if (m.status === "available") available++;
			else if (m.status === "unavailable") unavailable++;
			else undecided++;
		});
		return { available, unavailable, undecided };
	}, [selectedPartMembers]);

	// 세션 칩별 충족/부족 상태 및 요구인원 계산
	const getPartStatusInfo = (part: string) => {
		const required = partCounts[part] || 1;
		const isCustom = isLocalCustomSession(part, allAssignedGigParts);

		const candidatePerformers = isCustom
			? performers
			: performers.filter(
					(p) =>
						isPerformerMatchingSessionPart(p.part, part) ||
						(part.includes("보컬") &&
							isMatchingVocal(p, song?.recommendedVocals || [])),
				);

		let availableCount = 0;
		let undecidedCount = 0;

		candidatePerformers.forEach((p) => {
			const resp = (song?.responses || []).find(
				(r) =>
					r.sessionPart === part &&
					((r.userId && p.userId && r.userId === p.userId) ||
						(r.user?.name && r.user.name === p.name)),
			);
			const status = resp?.status || "undecided";
			if (status === "available") availableCount++;
			else if (status === "undecided") undecidedCount++;
		});

		const isFulfilled = availableCount >= required;
		const isImpossible = availableCount + undecidedCount < required;

		return {
			required,
			availableCount,
			undecidedCount,
			isFulfilled,
			isImpossible,
		};
	};

	// 서랍 열림 시 배경(body) 스크롤 고정 및 이중 스크롤바 방지
	useEffect(() => {
		if (!isOpen) return;

		const originalOverflow = document.body.style.overflow;
		const originalPaddingRight = document.body.style.paddingRight;
		const scrollbarWidth =
			window.innerWidth - document.documentElement.clientWidth;

		if (scrollbarWidth > 0) {
			document.body.style.paddingRight = `${scrollbarWidth}px`;
		}
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = originalOverflow;
			document.body.style.paddingRight = originalPaddingRight;
		};
	}, [isOpen]);

	// ESC 키 입력 시 서랍 닫기
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, onClose]);

	// 곡 변경 시 미디어 및 탐색 상태 리셋 (맨 처음 세션 파트 기본 선택)
	useEffect(() => {
		setActiveMediaIdx(0);
		setActiveSeekTime(null);
		setSelectedSessionPart(uniqueParts[0] || null);
	}, [song?.id, uniqueParts]);

	const currentMedia = mediaItems[activeMediaIdx] || mediaItems[0] || null;

	// 현재 활성 미디어에 등록된 구간(타임스탬프) 목록
	const currentMediaTimestamps = useMemo(() => {
		if (!currentMedia) return [];
		const items: { label: string; seconds: number; timestamp: string }[] = [];

		// 0. links의 timestamps 목록이 있다면 우선 추가
		if (currentMedia.timestamps && Array.isArray(currentMedia.timestamps)) {
			currentMedia.timestamps.forEach((ts) => {
				const firstPart = ts.time.split("~")[0].trim();
				const sec = parseTimestampToSeconds(firstPart);
				if (sec !== null && !items.some((it) => it.seconds === sec)) {
					items.push({
						label: ts.label,
						seconds: sec,
						timestamp: ts.time,
					});
				}
			});
		}

		// 1. note 내의 여러 타임스탬프들 파싱
		if (currentMedia.note) {
			const parsed = extractTimestampsFromText(currentMedia.note);
			parsed.forEach((p) => {
				if (!items.some((it) => it.seconds === p.seconds)) {
					items.push(p);
				}
			});
		}

		// 2. 링크 자체의 timestamp 필드가 있고 위에서 아직 추가 안 됐다면
		if (currentMedia.timestamp) {
			const sec = parseTimestampToSeconds(currentMedia.timestamp);
			if (sec !== null && !items.some((it) => it.seconds === sec)) {
				items.push({
					label: "",
					seconds: sec,
					timestamp: currentMedia.timestamp,
				});
			}
		}

		// 3. YouTube인 경우 URL의 ?t= 파라미터 확인
		if (currentMedia.type === "youtube") {
			const urlSec = extractYouTubeTimestamp(currentMedia.url);
			if (urlSec !== null && !items.some((it) => it.seconds === urlSec)) {
				items.push({
					label: "시작 지점",
					seconds: urlSec,
					timestamp: formatSecondsToTime(urlSec),
				});
			}
		}

		return items.sort((a, b) => a.seconds - b.seconds);
	}, [currentMedia]);

	const handleTimestampSeek = (seconds: number, targetUrl?: string) => {
		if (targetUrl) {
			const targetIdx = mediaItems.findIndex(
				(v) => v.url.trim() === targetUrl.trim(),
			);
			if (targetIdx !== -1 && targetIdx !== activeMediaIdx) {
				setActiveMediaIdx(targetIdx);
			}
		}
		setActiveSeekTime(seconds);

		// 상단 플레이어가 보이도록 스크롤 부드럽게 이동
		drawerBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	};

	useEffect(() => {
		if (!song?.createdBy) {
			setUserInfo(null);
			return;
		}

		if (typeof song.createdBy === "object") {
			setUserInfo(song.createdBy);
			return;
		}

		async function fetchUser() {
			const { data, error } = await supabase
				.from("performers")
				.select(`name, users ( generation, name )`)
				.eq("id", song?.createdBy)
				.single();

			if (!error && data) {
				const userObj = data.users as unknown as { generation?: number | null; name?: string } | null;
				setUserInfo({
					name: userObj?.name || data.name || "동아리 부원",
					generation: userObj?.generation ?? null,
				});
			} else {
				setUserInfo(null);
			}
		}
		fetchUser();
	}, [song?.createdBy, supabase]);

	return (
		<>
			<aside
				className={cn(
					"fixed inset-y-0 right-0 z-[100] w-full max-w-lg bg-background/95 backdrop-blur-md shadow-2xl border-l border-border transition-transform duration-300 ease-in-out transform flex flex-col",
					song ? "translate-x-0" : "translate-x-full",
				)}
			>
				{song && (
					<div className="flex flex-col h-full overflow-hidden">
						{/* 헤더 */}
						<div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-card/60 shrink-0">
							<div className="flex items-center gap-2">
								<div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
									<Music2 className="size-4" />
								</div>
								<div>
									<h2 className="text-sm font-bold tracking-tight text-foreground">
										곡 상세 정보
									</h2>
								</div>
							</div>
							<div className="flex items-center gap-1.5">
								{canEdit && onEdit && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => onEdit(song)}
										className="h-8 px-2.5 text-xs font-bold gap-1 text-foreground hover:text-primary hover:border-primary/50"
									>
										<Pencil className="size-3.5 text-primary" />
										<span>수정</span>
									</Button>
								)}
								<Button
									variant="ghost"
									size="icon"
									onClick={onClose}
									className="rounded-full size-8 hover:bg-muted"
								>
									<X className="size-4" />
								</Button>
							</div>
						</div>

						{/* 스크롤 가능한 메인 바디 */}
						<div
							ref={drawerBodyRef}
							className="flex-1 overflow-y-auto p-6 pb-28 space-y-6 text-left overscroll-contain sm:pb-6"
						>
							{/* 1. 곡 기본 정보 (타이틀, 아티스트, 뱃지, 추천자, 일시) */}
							<div className="p-5 rounded-2xl border border-border/80 bg-gradient-to-br from-card to-muted/30 shadow-sm space-y-3">
								{isGigSetlist && (
									<div className="flex flex-wrap items-center gap-2">
										<Badge className="bg-primary text-primary-foreground text-xs font-bold">
											공연 확정곡 #{song.orderNum}
										</Badge>
									</div>
								)}

								<div>
									<h3 className="text-2xl font-black tracking-tight text-foreground break-keep">
										{song.title}
									</h3>
									<p className="text-base font-semibold text-muted-foreground mt-0.5">
										{song.artist || "아티스트 미상"}
									</p>
								</div>

								{/* 추천자 정보 & 등록일시 */}
								<div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
									<div className="flex items-center gap-1.5 font-medium">
										<User className="size-3.5 text-primary" />
										<span>작성자:</span>
										<span className="font-bold text-foreground">
											{(() => {
												const author =
													userInfo ||
													(song?.createdBy && typeof song.createdBy === "object"
														? song.createdBy
														: null);
												if (!author) return "동아리 부원";
												return author.generation
													? `${author.generation}기 ${author.name}`
													: author.name;
											})()}
										</span>
									</div>
									<div className="flex items-center gap-2 text-[11px]">
										<span className="flex items-center gap-1">
											<CalendarDays className="size-3" />
											{new Date(song.createdAt).toLocaleString("ko-KR", {
												year: "numeric",
												month: "numeric",
												day: "numeric",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</span>
										{song.updatedAt && song.updatedAt !== song.createdAt && (
											<span className="flex items-center gap-1 text-muted-foreground">
												<History className="size-3" />
												(수정됨)
											</span>
										)}
									</div>
								</div>
							</div>

							{/* 2. 미디어 섹션 (유튜브 영상 임베드 또는 외부 링크 배너) */}
							{currentMedia ? (
								<div className="space-y-2.5">
									{/* 복수 미디어 선택 탭 */}
									{mediaItems.length > 1 && (
										<div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
											{mediaItems.map((m, i) => {
												const isYoutube = m.type === "youtube";
												const defaultLabel = isYoutube
													? `영상 ${mediaItems.slice(0, i + 1).filter((it) => it.type === "youtube").length}`
													: `링크 ${mediaItems.slice(0, i + 1).filter((it) => it.type === "external").length}`;
												const tabLabel = m.note?.trim() || defaultLabel;

												return (
													<button
														key={i}
														type="button"
														onClick={() => {
															setActiveMediaIdx(i);
															setActiveSeekTime(null);
														}}
														className={cn(
															"text-xs px-2.5 py-1 rounded-lg font-bold border transition-colors shrink-0 flex items-center gap-1.5 max-w-[150px] sm:max-w-[190px] cursor-pointer",
															activeMediaIdx === i
																? "bg-primary text-primary-foreground border-primary shadow-xs"
																: "bg-card border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted",
														)}
														title={tabLabel}
													>
														{isYoutube ? (
															<Play className="size-3 fill-current shrink-0" />
														) : (
															<Link2 className="size-3 shrink-0" />
														)}
														<span className="truncate text-left">{tabLabel}</span>
													</button>
												);
											})}
										</div>
									)}

									{/* 메인 미디어 표시 (유튜브 플레이어 또는 외부 링크 배너) */}
									{currentMedia.type === "youtube" ? (
										<div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-md border border-border bg-black">
											<iframe
												key={`${currentMedia.videoId}-${activeSeekTime ?? "default"}`}
												src={`https://www.youtube-nocookie.com/embed/${currentMedia.videoId}?rel=0${activeSeekTime !== null
														? `&start=${activeSeekTime}&autoplay=1`
														: ""
													}`}
												title={currentMedia.note || song.title}
												allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
												allowFullScreen
												className="w-full h-full"
											/>
										</div>
									) : (
										<ExternalLinkCard
											url={currentMedia.url}
											note={currentMedia.note}
										/>
									)}

									{/* 구간 바로가기 버튼 목록 */}
									{currentMediaTimestamps.length > 0 && (
										<div className="flex flex-wrap items-center gap-1.5 py-0.5">
											{currentMediaTimestamps.map((ts, idx) => {
												const displayTime = stripLeadingZeroTime(ts.timestamp);
												const hasLabel = Boolean(
													ts.label &&
														ts.label.trim() &&
														ts.label.trim() !== "주요 구간" &&
														ts.label.trim() !== "지정 구간" &&
														ts.label.trim() !== "시작 지점",
												);
												return (
													<button
														key={idx}
														type="button"
														onClick={() =>
															handleTimestampSeek(ts.seconds, currentMedia.url)
														}
														className={cn(
															"inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-2xs text-left max-w-full break-words",
															activeSeekTime === ts.seconds
																? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
																: "bg-card border-border/80 text-foreground hover:bg-primary/10 hover:border-primary/40",
														)}
														title={`${displayTime}${hasLabel ? ` (${ts.label})` : ""}`}
													>
														<Play className="size-2.5 fill-current shrink-0" />
														<span className="font-semibold tabular-nums shrink-0">{displayTime}</span>
														{hasLabel && (
															<span className="opacity-90 text-[11px] font-normal break-words whitespace-normal">
																{ts.label}
															</span>
														)}
													</button>
												);
											})}
										</div>
									)}

									{/* 미디어 아래 풀 설명 표시 */}
									{currentMedia.note?.trim() && (
										<div className="p-3 rounded-xl border border-border/70 bg-card/60 text-xs text-foreground leading-relaxed">
											<FormattedTimestampText
												text={currentMedia.note}
												onTimestampClick={(sec) =>
													handleTimestampSeek(sec, currentMedia.url)
												}
											/>
										</div>
									)}
								</div>
							) : null}

							{/* 3. 작성자의 어필 */}
							{song.description && (
								<div className="space-y-2">
									<h4 className="text-xs font-black tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
										<Quote className="size-3.5 text-primary" />
										어필
									</h4>
									<div className="p-4 rounded-2xl border border-border/80 bg-muted/20 text-sm leading-relaxed text-foreground whitespace-pre-wrap font-normal">
										<FormattedTimestampText
											text={song.description}
											onTimestampClick={(seconds) => handleTimestampSeek(seconds)}
										/>
									</div>
								</div>
							)}

							{/* 4. 악보 ('악보 있어요' / '악보 없어요' 및 악보 메모) */}
							<div className="flex flex-wrap items-center gap-2 text-xs">
								<span className="font-medium text-muted-foreground shrink-0 flex items-center gap-1">
									<FileText className="size-3.5 text-primary" />
									악보:
								</span>
								<Badge
									className={cn(
										"text-xs px-2.5 py-0.5 font-bold tracking-wider",
										song.sheetExists
											? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
											: "bg-muted text-muted-foreground border border-border hover:bg-muted",
									)}
								>
									{song.sheetExists ? "악보 있어요" : "악보 없어요"}
								</Badge>
								{song.sheetNote && (
									<span className="text-muted-foreground text-xs bg-muted/40 px-2 py-0.5 rounded-md border border-border/60 font-medium">
										{song.sheetNote}
									</span>
								)}
							</div>

							{/* 5. 세션 (충족 시 초록색, 부족 확정 시 빨간색, 인라인 응답 현황 통합) */}
							<div className="space-y-2.5">
								<div className="flex items-center justify-between">
									<h4 className="text-xs font-black tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
										<Layers className="size-3.5 text-primary" />
										세션
									</h4>
									<div className="flex items-center gap-2">
										{!isGigSetlist && (
											<>
												<span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">
													클릭하여 참여자 응답 확인
												</span>
												<span className="text-xs font-semibold text-muted-foreground">
													총 {song.requiredParts?.length ?? 0}명
												</span>
											</>
										)}
									</div>
								</div>

								{uniqueParts.length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{uniqueParts.map((part: string) => {
											const statusInfo = getPartStatusInfo(part);
											const isSelected = selectedSessionPart === part;

											let colorClass =
												"bg-card border-border/80 text-foreground hover:border-primary/50 hover:bg-muted/50";
											let countBadgeClass = "bg-primary/10 text-primary";

											if (statusInfo.isFulfilled) {
												colorClass =
													"bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/15";
												countBadgeClass =
													"bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
											} else if (statusInfo.isImpossible) {
												colorClass =
													"bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/40 hover:bg-rose-500/15";
												countBadgeClass =
													"bg-rose-500/20 text-rose-700 dark:text-rose-300";
											}

											return (
												<button
													key={part}
													type="button"
													onClick={() => {
														if (!isGigSetlist) {
															setSelectedSessionPart(isSelected ? null : part);
														}
													}}
													className={cn(
														"flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-bold shadow-xs transition-all text-left",
														colorClass,
														isSelected && "ring-2 ring-primary border-primary shadow-sm",
														!isGigSetlist
															? "cursor-pointer hover:scale-[1.02] active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/30"
															: "cursor-default",
													)}
													title={
														!isGigSetlist
															? `${part} 참여자 응답 현황 ${isSelected ? "닫기" : "보기"}`
															: undefined
													}
												>
													<span>{part}</span>
													{!isGigSetlist && (
														<span
															className={cn(
																"font-extrabold px-1.5 py-0.2 rounded-md text-xs",
																countBadgeClass,
															)}
														>
															{statusInfo.required}
														</span>
													)}
												</button>
											);
										})}
									</div>
								) : (
									<div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground bg-muted/20">
										등록된 세션이 없습니다. (자유 편성)
									</div>
								)}

								{/* 세션 참여자 현황 (기본값 첫 번째 세션 선택, 목록 형태) */}
								{selectedSessionPart && !isGigSetlist && (
									<div className="mt-2.5 rounded-2xl border border-border/80 bg-card/60 overflow-hidden shadow-xs animate-in fade-in-50 duration-150 p-3.5 space-y-3">
										<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
											<span className="text-xs font-bold text-foreground flex items-center gap-1.5">
												<Users className="size-3.5 text-primary" />
												<span>{selectedSessionPart} 가능 여부</span>
											</span>
											<div className="flex items-center gap-1.5 text-[11px] font-semibold">
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
													<CheckCircle2 className="size-3" />
													가능 {selectedPartStats.available}명
												</span>
												<span
													className={cn(
														"inline-flex items-center gap-1 px-2 py-0.5 rounded-md border",
														selectedPartStats.unavailable > 0
															? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
															: "bg-muted/50 text-muted-foreground/70 border-border/60",
													)}
												>
													<XCircle className="size-3" />
													불가능 {selectedPartStats.unavailable}명
												</span>
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
													<HelpCircle className="size-3" />
													미선택 {selectedPartStats.undecided}명
												</span>
											</div>
										</div>

										{selectedPartMembers.length > 0 ? (
											<div className="space-y-1.5 max-h-72 overflow-y-auto overscroll-contain pr-0.5">
												{selectedPartMembers.map((m) => {
													const isAvail = m.status === "available";
													const isUnavail = m.status === "unavailable";

													return (
														<div
															key={m.key}
															className={cn(
																"p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs",
																m.isMe
																	? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
																	: "border-border/80 bg-card hover:border-border",
															)}
														>
															{/* 참여자 정보 & 응답 뱃지 */}
															<div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
																<Badge
																	className={cn(
																		"h-6 px-2 text-[11px] font-bold shrink-0 gap-1 rounded-lg",
																		isAvail
																			? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
																			: isUnavail
																				? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
																				: "bg-muted text-muted-foreground border-border",
																	)}
																>
																	{isAvail ? (
																		<CheckCircle2 className="size-3" />
																	) : isUnavail ? (
																		<XCircle className="size-3" />
																	) : (
																		<HelpCircle className="size-3" />
																	)}
																	<span>
																		{isAvail ? "가능" : isUnavail ? "불가능" : "미선택"}
																	</span>
																</Badge>

																<div className="flex items-center gap-1.5 min-w-0">
																	<span className="font-bold text-foreground text-sm truncate">
																		{m.generation ? `${m.generation}기 ` : ""}
																		{m.name}
																	</span>
																	{m.isMe && (
																		<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
																			나
																		</span>
																	)}
																	{m.isRecommendedVocal && (
																		<span
																			className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0 inline-flex items-center justify-center cursor-help"
																			title="작성자가 이 세션으로 추천한 부원입니다."
																		>
																			<Star className="size-2.5 fill-current sm:hidden" />
																			<span className="hidden sm:inline">추천</span>
																		</span>
																	)}
																	{m.part && (
																		<span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-muted/80 text-muted-foreground border border-border/60 shrink-0">
																			{m.part}
																		</span>
																	)}
																</div>
															</div>

															{/* 작성 메모 (메모 없으면 굳이 표시하지 않음) */}
															{m.comment?.trim() ? (
																<div
																	className="flex items-center gap-1.5 text-xs text-foreground bg-muted/60 px-3 py-1.5 rounded-xl border border-border/60 max-w-full sm:max-w-[50%] shrink-0 min-w-0"
																	title={m.comment}
																>
																	<MessageSquare className="size-3 text-primary shrink-0 opacity-80" />
																	<span className="truncate font-medium">{m.comment}</span>
																</div>
															) : null}
														</div>
													);
												})}
											</div>
										) : (
											<div className="p-4 text-center text-xs text-muted-foreground">
												해당 세션의 참여자가 없습니다.
											</div>
										)}
									</div>
								)}
							</div>

							{/* 6. 나의 응답 (후보곡일 때 노출) */}
							{!isGigSetlist && (
								<div className="pt-2 border-t border-border/60">
									<NominationResponseSection
										nominationId={song.id}
										gigId={String(song.gigId)}
										currentUserId={currentUserId}
										canRespond={canRespond}
										requiredParts={song.requiredParts || []}
										recommendedVocals={song.recommendedVocals || []}
										responses={song.responses || []}
										performers={performers}
										onResponseUpdated={(newResponses) => {
											if (onSongUpdated) {
												onSongUpdated({ ...song, responses: newResponses });
											}
										}}
									/>
								</div>
							)}
						</div>
					</div>
				)}
			</aside>

			{/* 서랍 열렸을 때 배경 블러 딤 처리 */}
			<div
				className={cn(
					"fixed inset-0 z-[90] bg-black/50 backdrop-blur-xs transition-opacity duration-300",
					song ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none",
				)}
				onClick={onClose}
			/>
		</>
	);
}
