"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import {
	type NominationResponse,
	type NominationResponseStatus,
	type RecommendedVocal,
	getEligibleSessionsForUser,
	type EligibleSession,
} from "@/lib/setlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveNominationResponsesAction } from "@/app/gigs/[id]/nominations/actions";
import {
	CheckCircle2,
	HelpCircle,
	XCircle,
	MessageSquare,
	Loader2,
	Save,
	Pencil,
	X,
	Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NominationResponseSectionProps {
	nominationId: number;
	gigId: string;
	currentUserId?: string | null;
	canRespond: boolean;
	requiredParts?: string[];
	recommendedVocals?: RecommendedVocal[];
	responses: NominationResponse[];
	performers: RecommendedVocal[];
	onResponseUpdated?: (newResponses: NominationResponse[]) => void;
}

export function NominationResponseSection({
	nominationId,
	gigId,
	currentUserId,
	canRespond,
	requiredParts = [],
	recommendedVocals = [],
	responses,
	performers,
	onResponseUpdated,
}: NominationResponseSectionProps) {
	const [isPending, startTransition] = useTransition();
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	// 현재 사용자가 이 곡에서 응답 가능한 세션 목록 도출
	const eligibleSessions = useMemo<EligibleSession[]>(() => {
		return getEligibleSessionsForUser(
			{
				requiredParts,
				recommendedVocals,
				responses,
			} as any,
			performers,
			currentUserId,
		);
	}, [requiredParts, recommendedVocals, responses, performers, currentUserId]);

	// 현재 사용자의 세션별 기존 응답 매핑
	const myResponsesBySession = useMemo(() => {
		const map = new Map<string, NominationResponse>();
		if (!currentUserId) return map;
		responses.forEach((r) => {
			if (r.userId === currentUserId && r.sessionPart) {
				map.set(r.sessionPart, r);
			}
		});
		return map;
	}, [responses, currentUserId]);

	// 모달 내부 세션별 임시 폼 상태 (sessionPart -> { status, comment })
	const [tempForm, setTempForm] = useState<
		Record<string, { status: NominationResponseStatus; comment: string }>
	>({});

	// 모달 열 때 폼 상태 동기화
	const handleOpenDialog = () => {
		const initial: Record<
			string,
			{ status: NominationResponseStatus; comment: string }
		> = {};
		eligibleSessions.forEach((item) => {
			const existing = myResponsesBySession.get(item.sessionPart);
			initial[item.sessionPart] = {
				status: existing?.status || "undecided",
				comment: existing?.comment || "",
			};
		});
		setTempForm(initial);
		setIsDialogOpen(true);
	};

	const handleCloseDialog = () => {
		setIsDialogOpen(false);
	};

	// ESC 키로 다이얼로그 닫기
	useEffect(() => {
		if (!isDialogOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") handleCloseDialog();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isDialogOpen]);

	const handleSave = () => {
		if (!canRespond) {
			toast.error("공연 참여자만 가능 여부를 등록할 수 있습니다.");
			return;
		}

		if (eligibleSessions.length === 0) {
			toast.error("응답 가능한 세션이 없습니다.");
			return;
		}

		startTransition(async () => {
			try {
				const payload = eligibleSessions.map((item) => {
					const data = tempForm[item.sessionPart] || {
						status: "undecided",
						comment: "",
					};
					return {
						sessionPart: item.sessionPart,
						status: data.status,
						comment: data.comment,
					};
				});

				await saveNominationResponsesAction(nominationId, gigId, payload);
				setIsDialogOpen(false);
				toast.success("가능 여부 및 메모가 저장되었습니다.");

				// 클라이언트 상태 낙관적 갱신
				if (currentUserId) {
					const currentPerformer =
						performers.find((p) => p.userId === currentUserId) ||
						performers.find((p) => p.name);

					// 현재 사용자의 기존 응답 중 이번에 수정한 세션들을 제외한 나머지
					const eligibleParts = eligibleSessions.map((s) => s.sessionPart);
					const otherResponses = responses.filter(
						(r) => !(r.userId === currentUserId && eligibleParts.includes(r.sessionPart)),
					);

					const updatedItems: NominationResponse[] = eligibleSessions.map(
						(item) => {
							const existing = myResponsesBySession.get(item.sessionPart);
							const data = tempForm[item.sessionPart] || {
								status: "undecided",
								comment: "",
							};
							return {
								id: existing?.id || Date.now() + Math.random(),
								nominationId,
								userId: currentUserId,
								sessionPart: item.sessionPart,
								status: data.status,
								comment: data.comment.trim(),
								createdAt: existing?.createdAt || new Date().toISOString(),
								updatedAt: new Date().toISOString(),
								user: {
									name: currentPerformer?.name || "나",
									generation: currentPerformer?.generation ?? null,
									part: currentPerformer?.part || null,
								},
							};
						},
					);

					onResponseUpdated?.([...otherResponses, ...updatedItems]);
				}
			} catch (err: unknown) {
				console.error("Save response error:", err);
				const msg = err instanceof Error ? err.message : "저장에 실패했습니다.";
				toast.error(msg);
			}
		});
	};

	// 렌더링 헬퍼: 가능 여부 뱃지 (기존 디자인 100% 동일)
	const renderStatusBadge = (status: NominationResponseStatus) => {
		return (
			<Badge
				className={cn(
					"h-6 px-2 text-[11px] font-bold shrink-0 gap-1 rounded-lg",
					status === "available"
						? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
						: status === "unavailable"
							? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
							: "bg-muted text-muted-foreground border-border",
				)}
			>
				{status === "available" ? (
					<CheckCircle2 className="size-3" />
				) : status === "unavailable" ? (
					<XCircle className="size-3" />
				) : (
					<HelpCircle className="size-3" />
				)}
				<span>
					{status === "available"
						? "가능"
						: status === "unavailable"
							? "불가능"
							: "미응답"}
				</span>
			</Badge>
		);
	};

	// 참여 가능한 세션이 없을 때
	if (eligibleSessions.length === 0) {
		return (
			<div className="p-3.5 rounded-2xl border border-border/80 bg-card flex items-center justify-between gap-3 shadow-2xs text-xs text-muted-foreground">
				<span>나의 응답: 이 곡에서 참여 가능한 배정 세션이 없습니다.</span>
			</div>
		);
	}

	// 1개 세션만 응답 가능한 경우: 단일 행 렌더링
	if (eligibleSessions.length === 1) {
		const sessionItem = eligibleSessions[0];
		const resp = myResponsesBySession.get(sessionItem.sessionPart);
		const currentStatus = resp?.status || "undecided";
		const currentComment = resp?.comment || "";

		return (
			<>
				<div className="p-3.5 rounded-2xl border border-border/80 bg-card flex items-center justify-between gap-3 shadow-2xs">
					<div className="flex items-center gap-2 min-w-0 flex-wrap">
						<span className="text-xs font-bold text-muted-foreground shrink-0">
							나의 응답:
						</span>

						{/* 세션 칩 */}
						<Badge
							variant="outline"
							className="h-6 px-2 text-[11px] font-bold bg-muted/60 text-foreground border-border/70 rounded-lg shrink-0 gap-1"
						>
							<span>{sessionItem.sessionPart}</span>
							{sessionItem.isRecommendedVocal && (
								<span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
									추천
								</span>
							)}
							{sessionItem.isLocalCustom && (
								<span className="text-[9px] px-1 py-0.2 rounded bg-primary/10 text-primary font-bold">
									자유
								</span>
							)}
						</Badge>

						{/* 가능 여부 칩 */}
						{renderStatusBadge(currentStatus)}

						{/* 작성 메모 (있을 때만 노출) */}
						{currentComment ? (
							<div
								className="flex items-center gap-1.5 text-xs text-foreground bg-muted/60 px-2.5 py-1 rounded-lg border border-border/60 truncate min-w-0 max-w-[140px] sm:max-w-[200px]"
								title={currentComment}
							>
								<MessageSquare className="size-3 text-primary shrink-0 opacity-80" />
								<span className="truncate font-medium">{currentComment}</span>
							</div>
						) : null}
					</div>

					{canRespond && (
						<Button
							type="button"
							size="sm"
							onClick={handleOpenDialog}
							className="h-8 px-3 text-xs font-bold shrink-0 gap-1.5 cursor-pointer ml-auto"
						>
							<Pencil className="size-3.5" />
							<span>가능 여부 응답</span>
						</Button>
					)}
				</div>

				{renderDialog()}
			</>
		);
	}

	// 2개 이상의 세션에 응답 가능한 경우: 세션별 다중 행 렌더링
	return (
		<>
			<div className="p-3.5 rounded-2xl border border-border/80 bg-card space-y-2.5 shadow-2xs">
				<div className="flex items-center justify-between gap-3">
					<span className="text-xs font-bold text-muted-foreground">
						나의 응답 ({eligibleSessions.length}개 세션)
					</span>
					{canRespond && (
						<Button
							type="button"
							size="sm"
							onClick={handleOpenDialog}
							className="h-7 px-2.5 text-xs font-bold shrink-0 gap-1 cursor-pointer ml-auto"
						>
							<Pencil className="size-3" />
							<span>가능 여부 응답</span>
						</Button>
					)}
				</div>

				<div className="space-y-1.5 pt-0.5">
					{eligibleSessions.map((sessionItem) => {
						const resp = myResponsesBySession.get(sessionItem.sessionPart);
						const currentStatus = resp?.status || "undecided";
						const currentComment = resp?.comment || "";

						return (
							<div
								key={sessionItem.sessionPart}
								className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-muted/30 border border-border/50 text-xs"
							>
								<div className="flex items-center gap-2 min-w-0 flex-wrap">
									{/* 세션 칩 */}
									<Badge
										variant="outline"
										className="h-6 px-2 text-[11px] font-bold bg-muted/60 text-foreground border-border/70 rounded-lg shrink-0 gap-1"
									>
										<span>{sessionItem.sessionPart}</span>
										{sessionItem.isRecommendedVocal && (
											<span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
												추천
											</span>
										)}
										{sessionItem.isLocalCustom && (
											<span className="text-[9px] px-1 py-0.2 rounded bg-primary/10 text-primary font-bold">
												자유
											</span>
										)}
									</Badge>

									{/* 가능 여부 칩 */}
									{renderStatusBadge(currentStatus)}

									{/* 작성 메모 */}
									{currentComment ? (
										<div
											className="flex items-center gap-1.5 text-xs text-foreground bg-background/80 px-2 py-0.5 rounded-lg border border-border/60 truncate min-w-0 max-w-[150px] sm:max-w-[220px]"
											title={currentComment}
										>
											<MessageSquare className="size-3 text-primary shrink-0 opacity-80" />
											<span className="truncate font-medium">{currentComment}</span>
										</div>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{renderDialog()}
		</>
	);

	// 공통 응답 모달 다이얼로그
	function renderDialog() {
		if (!isDialogOpen) return null;

		return (
			<div
				className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
				onClick={handleCloseDialog}
			>
				<div
					role="dialog"
					aria-modal="true"
					className="relative w-full max-w-md bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 text-left"
					onClick={(e) => e.stopPropagation()}
				>
					{/* 다이얼로그 헤더 */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-muted/40 shrink-0">
						<div className="flex items-center gap-2">
							<div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
								<CheckCircle2 className="size-4" />
							</div>
							<div>
								<h3 className="text-sm font-black tracking-tight text-foreground">
									내 가능 여부 응답
								</h3>
								<p className="text-[11px] text-muted-foreground">
									참여 가능한 세션별로 가능 여부와 메모를 입력해주세요.
								</p>
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleCloseDialog}
							className="rounded-full size-8 hover:bg-muted"
						>
							<X className="size-4" />
						</Button>
					</div>

					{/* 다이얼로그 본문: 세션 카드 목록 */}
					<div className="p-6 space-y-4 overflow-y-auto flex-1 text-left">
						{eligibleSessions.map((sessionItem) => {
							const current = tempForm[sessionItem.sessionPart] || {
								status: "undecided",
								comment: "",
							};

							return (
								<div
									key={sessionItem.sessionPart}
									className="p-3.5 rounded-2xl border border-border/80 bg-muted/20 space-y-3 shadow-2xs"
								>
									{/* 세션명 뱃지 및 속성 표기 */}
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-1.5">
											<Badge
												variant="outline"
												className="text-xs font-extrabold bg-background text-foreground border-border/80 px-2 py-0.5"
											>
												{sessionItem.sessionPart}
											</Badge>
											{sessionItem.isRecommendedVocal && (
												<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
													추천 보컬
												</span>
											)}
											{sessionItem.isLocalCustom && (
												<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold">
													자유 참여 세션
												</span>
											)}
										</div>
									</div>

									{/* 3-세그먼트 상태 선택 버튼 (기존 컴포넌트 디자인 100% 동일) */}
									<div className="grid grid-cols-3 gap-2">
										<button
											type="button"
											onClick={() =>
												setTempForm((prev) => ({
													...prev,
													[sessionItem.sessionPart]: {
														...(prev[sessionItem.sessionPart] || { comment: "" }),
														status: "available",
													},
												}))
											}
											className={cn(
												"h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer",
												current.status === "available"
													? "bg-emerald-500 text-white border-emerald-600 shadow-xs"
													: "bg-background text-muted-foreground hover:bg-muted/80 border-border/80",
											)}
										>
											<CheckCircle2 className="size-3.5" />
											<span>가능</span>
										</button>

										<button
											type="button"
											onClick={() =>
												setTempForm((prev) => ({
													...prev,
													[sessionItem.sessionPart]: {
														...(prev[sessionItem.sessionPart] || { comment: "" }),
														status: "undecided",
													},
												}))
											}
											className={cn(
												"h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer",
												current.status === "undecided"
													? "bg-foreground text-background border-foreground shadow-xs"
													: "bg-background text-muted-foreground hover:bg-muted/80 border-border/80",
											)}
										>
											<HelpCircle className="size-3.5" />
											<span>미응답</span>
										</button>

										<button
											type="button"
											onClick={() =>
												setTempForm((prev) => ({
													...prev,
													[sessionItem.sessionPart]: {
														...(prev[sessionItem.sessionPart] || { comment: "" }),
														status: "unavailable",
													},
												}))
											}
											className={cn(
												"h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer",
												current.status === "unavailable"
													? "bg-rose-500 text-white border-rose-600 shadow-xs"
													: "bg-background text-muted-foreground hover:bg-muted/80 border-border/80",
											)}
										>
											<XCircle className="size-3.5" />
											<span>불가능</span>
										</button>
									</div>

									{/* 메모 입력창 */}
									<div className="space-y-1">
										<Input
											placeholder="메모 입력 (선택 사항, 예: 원키 가능, 솔로 카피 어려움)"
											value={current.comment}
											onChange={(e) =>
												setTempForm((prev) => ({
													...prev,
													[sessionItem.sessionPart]: {
														...(prev[sessionItem.sessionPart] || {
															status: "undecided",
														}),
														comment: e.target.value,
													},
												}))
											}
											className="h-8.5 text-xs bg-background"
										/>
									</div>
								</div>
							);
						})}
					</div>

					{/* 다이얼로그 푸터 */}
					<div className="px-6 py-3.5 border-t border-border/70 bg-muted/30 flex items-center justify-end gap-2 shrink-0">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleCloseDialog}
							disabled={isPending}
							className="h-8 px-3 text-xs font-semibold"
						>
							취소
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={handleSave}
							disabled={isPending}
							className="h-8 px-4 text-xs font-bold gap-1.5 shadow-xs"
						>
							{isPending ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : (
								<Save className="size-3.5" />
							)}
							<span>저장</span>
						</Button>
					</div>
				</div>
			</div>
		);
	}
}
