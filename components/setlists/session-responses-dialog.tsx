"use client";

import { useEffect, useMemo, useState } from "react";
import {
	type NominationResponse,
	type NominationResponseStatus,
	type RecommendedVocal,
	isPerformerMatchingSessionPart,
	sortSessionParts,
} from "@/lib/setlist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	X,
	Users,
	CheckCircle2,
	HelpCircle,
	XCircle,
	MessageSquare,
	Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionResponsesDialogProps {
	isOpen: boolean;
	onClose: () => void;
	songTitle: string;
	requiredParts: string[];
	initialSelectedPart?: string | null;
	performers: RecommendedVocal[];
	recommendedVocals?: RecommendedVocal[];
	responses: NominationResponse[];
	currentUserId?: string | null;
}

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

export function SessionResponsesDialog({
	isOpen,
	onClose,
	songTitle,
	requiredParts,
	initialSelectedPart,
	performers,
	recommendedVocals = [],
	responses,
	currentUserId,
}: SessionResponsesDialogProps) {
	// 중복 없는 정렬된 파트 목록
	const uniqueParts = useMemo(() => {
		return sortSessionParts(Array.from(new Set(requiredParts)));
	}, [requiredParts]);

	const [activePart, setActivePart] = useState<string>("all");

	// 열릴 때 초기 선택 파트 동기화
	useEffect(() => {
		if (isOpen) {
			if (initialSelectedPart && (uniqueParts.includes(initialSelectedPart) || initialSelectedPart === "all")) {
				setActivePart(initialSelectedPart);
			} else if (uniqueParts.length > 0) {
				setActivePart(uniqueParts[0]);
			} else {
				setActivePart("all");
			}
		}
	}, [isOpen, initialSelectedPart, uniqueParts]);

	// ESC 키로 닫기
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	// 전체 참여자 및 응답 매핑
	const allMembers = useMemo<PerformerResponseItem[]>(() => {
		const list: PerformerResponseItem[] = performers.map((p) => {
			const resp = responses.find(
				(r) =>
					(r.userId && p.userId && r.userId === p.userId) ||
					(r.user?.name && r.user.name === p.name),
			);
			const isMe = Boolean(currentUserId && p.userId && p.userId === currentUserId);
			const isRec = isMatchingVocal(p, recommendedVocals);
			return {
				key: `performer-${p.id}`,
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

		// performers에 없으나 responses에 응답이 있는 사용자 추가
		responses.forEach((r) => {
			const alreadyInList = list.some(
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
					recommendedVocals,
				);
				list.push({
					key: `resp-${r.id}`,
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

		// recommendedVocals 중 아직 목록에 없는 인원 추가
		recommendedVocals.forEach((rec) => {
			const alreadyInList = list.some(
				(item) =>
					(item.userId && rec.userId && item.userId === rec.userId) ||
					(item.name === rec.name &&
						(!rec.generation || !item.generation || item.generation === rec.generation)),
			);
			if (!alreadyInList) {
				const isMe = Boolean(currentUserId && rec.userId && rec.userId === currentUserId);
				list.push({
					key: `rec-${rec.id}`,
					userId: rec.userId,
					name: rec.name,
					generation: rec.generation ?? null,
					part: rec.part || "보컬",
					status: "undecided",
					comment: "",
					isMe,
					isRecommendedVocal: true,
				});
			}
		});

		return list;
	}, [performers, responses, recommendedVocals, currentUserId]);

	// 현재 선택된 세션 파트에 해당하는 멤버 목록 필터링
	const filteredMembers = useMemo<PerformerResponseItem[]>(() => {
		let members: PerformerResponseItem[];
		if (activePart === "all") {
			members = [...allMembers];
		} else {
			members = allMembers.filter(
				(m) =>
					isPerformerMatchingSessionPart(m.part, activePart) ||
					(activePart.includes("보컬") && m.isRecommendedVocal),
			);
		}

		// 정렬: 본인 최우선 > 추천 보컬 > 가능 > 불가능 > 미선택 순
		return members.sort((a, b) => {
			if (a.isMe) return -1;
			if (b.isMe) return 1;
			if (a.isRecommendedVocal && !b.isRecommendedVocal) return -1;
			if (!a.isRecommendedVocal && b.isRecommendedVocal) return 1;
			const order: Record<NominationResponseStatus, number> = {
				available: 1,
				unavailable: 2,
				undecided: 3,
			};
			return (order[a.status] || 99) - (order[b.status] || 99);
		});
	}, [allMembers, activePart]);

	// 현재 활성 파트 통계
	const stats = useMemo(() => {
		let available = 0;
		let unavailable = 0;
		let undecided = 0;

		filteredMembers.forEach((m) => {
			if (m.status === "available") available++;
			else if (m.status === "unavailable") unavailable++;
			else undecided++;
		});

		return { available, unavailable, undecided, total: filteredMembers.length };
	}, [filteredMembers]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				className="relative w-full max-w-lg bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
				onClick={(e) => e.stopPropagation()}
			>
				{/* 1. 모달 헤더 */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-muted/40 shrink-0">
					<div className="flex items-center gap-2.5 min-w-0">
						<div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
							<Users className="size-4.5" />
						</div>
						<div className="min-w-0">
							<h3 className="text-sm font-black tracking-tight text-foreground flex items-center gap-1.5 truncate">
								세션 참여자 응답 현황
							</h3>
							<p className="text-xs font-semibold text-muted-foreground truncate">
								{songTitle}
							</p>
						</div>
					</div>

					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						className="rounded-full size-8 hover:bg-muted shrink-0"
					>
						<X className="size-4" />
					</Button>
				</div>

				{/* 2. 세션 파트 전환 탭 */}
				<div className="px-6 pt-3 pb-2 border-b border-border/60 bg-card shrink-0">
					<div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
						{uniqueParts.map((part) => {
							const isActive = activePart === part;
							const count = allMembers.filter((m) =>
								isPerformerMatchingSessionPart(m.part, part),
							).length;
							const availCount = allMembers.filter(
								(m) =>
									isPerformerMatchingSessionPart(m.part, part) &&
									m.status === "available",
							).length;

							return (
								<button
									key={part}
									type="button"
									onClick={() => setActivePart(part)}
									className={cn(
										"px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 cursor-pointer",
										isActive
											? "bg-primary text-primary-foreground border-primary shadow-xs"
											: "bg-muted/40 border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted",
									)}
								>
									<span>{part}</span>
									<span
										className={cn(
											"text-[10px] px-1 py-0.2 rounded-md font-extrabold",
											isActive
												? "bg-white/20 text-white"
												: "bg-muted text-muted-foreground",
										)}
									>
										{availCount}/{count}
									</span>
								</button>
							);
						})}

						{/* 전체 보기 탭 */}
						<button
							type="button"
							onClick={() => setActivePart("all")}
							className={cn(
								"px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ml-auto",
								activePart === "all"
									? "bg-foreground text-background border-foreground shadow-xs"
									: "bg-muted/40 border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted",
							)}
						>
							<span>전체</span>
							<span
								className={cn(
									"text-[10px] px-1 py-0.2 rounded-md font-extrabold",
									activePart === "all"
										? "bg-background/20 text-background"
										: "bg-muted text-muted-foreground",
								)}
							>
								{allMembers.length}
							</span>
						</button>
					</div>

					{/* 현재 파트 통계 요약 바 */}
					<div className="flex items-center justify-between pt-2.5 text-xs">
						<span className="font-bold text-muted-foreground text-[11px]">
							{activePart === "all" ? "전체 참여자" : `${activePart} 세션`} ({stats.total}명)
						</span>
						<div className="flex items-center gap-1.5 text-[11px] font-semibold">
							<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
								<CheckCircle2 className="size-3" />
								가능 {stats.available}
							</span>
							{stats.unavailable > 0 && (
								<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
									<XCircle className="size-3" />
									불가능 {stats.unavailable}
								</span>
							)}
							<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
								<HelpCircle className="size-3" />
								미선택 {stats.undecided}
							</span>
						</div>
					</div>
				</div>

				{/* 3. 응답 목록 본문 */}
				<div className="flex-1 overflow-y-auto p-4 space-y-2">
					{filteredMembers.length > 0 ? (
						filteredMembers.map((item) => {
							const isAvail = item.status === "available";
							const isUnavail = item.status === "unavailable";

							return (
								<div
									key={item.key}
									className={cn(
										"p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs",
										item.isMe
											? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
											: item.isRecommendedVocal
												? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
												: "border-border/80 bg-card hover:border-border",
									)}
								>
									{/* 참여자 정보 & 응답 뱃지 */}
									<div className="flex items-center gap-2.5 min-w-0">
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

										<div className="flex items-center gap-1.5 min-w-0 truncate">
											<span className="font-bold text-foreground text-sm truncate">
												{item.generation ? `${item.generation}기 ` : ""}
												{item.name}
											</span>
											{item.isMe && (
												<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
													나
												</span>
											)}
											{item.isRecommendedVocal && (
												<span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0">
													<Mic className="size-2.5" />
													추천 보컬
												</span>
											)}
											{item.part && (
												<span className="text-xs font-medium text-muted-foreground shrink-0">
													({item.part})
												</span>
											)}
										</div>
									</div>

									{/* 작성 메모 말풍선 */}
									{item.comment ? (
										<div className="flex items-center gap-1.5 text-xs text-foreground bg-muted/60 px-3 py-1.5 rounded-xl border border-border/60 max-w-full sm:max-w-[60%] shrink-0">
											<MessageSquare className="size-3 text-primary shrink-0 opacity-80" />
											<span className="truncate font-medium">{item.comment}</span>
										</div>
									) : (
										<span className="text-[11px] text-muted-foreground/50 italic hidden sm:inline">
											메모 없음
										</span>
									)}
								</div>
							);
						})
					) : (
						<div className="py-12 text-center text-xs text-muted-foreground space-y-1">
							<Users className="size-8 text-muted-foreground/40 mx-auto mb-2" />
							<p className="font-bold">등록된 참여자가 없습니다.</p>
							<p className="text-[11px] text-muted-foreground/70">
								해당 세션 파트의 공연 참여자가 아직 등록되지 않았습니다.
							</p>
						</div>
					)}
				</div>

				{/* 4. 모달 하단 푸터 */}
				<div className="px-6 py-3 border-t border-border/70 bg-muted/30 flex items-center justify-between shrink-0">
					<span className="text-xs text-muted-foreground font-medium">
						세션 탭을 눌러 파트별 응답을 빠르게 확인할 수 있습니다.
					</span>
					<Button
						variant="outline"
						size="sm"
						onClick={onClose}
						className="h-8 px-4 text-xs font-bold"
					>
						닫기
					</Button>
				</div>
			</div>
		</div>
	);
}
