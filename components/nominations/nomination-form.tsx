"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	defaultRequiredParts,
	sortSessionParts,
	type Nomination,
	type NominationFormValues,
	type RecommendedVocal,
} from "@/lib/nomination";
import { RecommendedVocalSelector } from "@/components/nominations/recommended-vocal-selector";
import { LinkPreviewItem } from "@/components/nominations/link-preview-item";
import {
	Music2,
	Check,
	X,
	Plus,
	Loader2,
	Trash2,
	CircleHelp,
	ArrowLeft,
	Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
	LeaveConfirmDialog,
	useUnsavedChangesWarning,
} from "@/components/ui/leave-confirm-dialog";
import {
	addNomination,
	updateNomination,
	deleteNomination,
} from "@/app/gigs/[id]/nominations/actions";
import Link from "next/link";

interface NominationFormProps {
	mode: "create" | "edit";
	gigId: number;
	gigTitle?: string;
	initialData?: Nomination | null;
	performers?: RecommendedVocal[];
	canDelete?: boolean;
}

export function NominationForm({
	mode,
	gigId,
	gigTitle = "공연",
	initialData,
	performers = [],
	canDelete = false,
}: NominationFormProps) {
	const router = useRouter();
	const [showSessionHelp, setShowSessionHelp] = useState(false);
	const DEFAULT_SESSIONS = defaultRequiredParts();

	const [form, setForm] = useState<NominationFormValues>({
		title: initialData?.title || "",
		artist: initialData?.artist || "",
		requiredParts: initialData?.requiredParts || [
			"기타",
			"베이스",
			"드럼",
		],
		recommendedVocals: initialData?.recommendedVocals || [],
		sheetExists: initialData?.sheetExists ?? true,
		sheetNote: initialData?.sheetNote || "",
		description: initialData?.description || "",
		links:
			initialData?.links && initialData.links.length > 0
				? initialData.links
				: [{ url: "", note: "", timestamp: "", timestamps: [] }],
	});
	const [newPart, setNewPart] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// initialData가 전달되거나 변경되면 form 상태 동기화 (수정 페이지 진입 등)
	useEffect(() => {
		if (initialData) {
			setForm({
				title: initialData.title || "",
				artist: initialData.artist || "",
				requiredParts: initialData.requiredParts || [
					"기타",
					"베이스",
					"드럼",
				],
				recommendedVocals: initialData.recommendedVocals || [],
				sheetExists: initialData.sheetExists ?? true,
				sheetNote: initialData.sheetNote || "",
				description: initialData.description || "",
				links:
					initialData.links && initialData.links.length > 0
						? initialData.links
						: [{ url: "", note: "", timestamp: "", timestamps: [] }],
			});
		}
	}, [initialData]);

	// 변경 사항 감지
	const isDirty = useMemo(() => {
		if (!initialData) {
			return (
				Boolean(form.title.trim()) ||
				Boolean(form.artist.trim()) ||
				Boolean(form.description.trim()) ||
				Boolean(form.sheetNote?.trim()) ||
				form.links.some((l) => l.url.trim().length > 0)
			);
		}
		return (
			form.title !== initialData.title ||
			form.artist !== initialData.artist ||
			form.sheetExists !== initialData.sheetExists ||
			(form.sheetNote || "") !== (initialData.sheetNote || "") ||
			form.description !== initialData.description ||
			JSON.stringify(form.requiredParts) !==
				JSON.stringify(initialData.requiredParts) ||
			JSON.stringify(form.recommendedVocals) !==
				JSON.stringify(initialData.recommendedVocals) ||
			JSON.stringify(form.links) !== JSON.stringify(initialData.links)
		);
	}, [form, initialData]);

	// 이탈 방지 경고 훅
	const { showLeaveModal, confirmLeave, cancelLeave, triggerConfirm, markSubmitting } =
		useUnsavedChangesWarning({ isDirty });

	// 파트별 인원 수 계산
	const uniqueParts = useMemo(() => {
		return sortSessionParts(Array.from(new Set(form.requiredParts)));
	}, [form.requiredParts]);

	const handleAddPart = (partName: string) => {
		const trimmed = partName.trim();
		if (!trimmed) return;
		setForm((prev) => ({
			...prev,
			requiredParts: [...prev.requiredParts, trimmed],
		}));
		setNewPart("");
	};

	const handleRemovePart = (partName: string) => {
		setForm((prev) => {
			const idx = prev.requiredParts.lastIndexOf(partName);
			if (idx === -1) return prev;
			const next = [...prev.requiredParts];
			next.splice(idx, 1);
			return { ...prev, requiredParts: next };
		});
	};

	const updateRef = (
		index: number,
		field: "url" | "note" | "timestamp" | "timestamps",
		value: any,
	) => {
		setForm((prev) => {
			const next = [...prev.links];
			next[index] = { ...next[index], [field]: value };
			return { ...prev, links: next };
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.title.trim()) {
			toast.error("곡 제목을 입력해주세요.");
			return;
		}
		if (form.requiredParts.length === 0) {
			toast.error("필요 세션을 1개 이상 추가해주세요.");
			return;
		}

		// 유효한 링크만 필터링
		const cleanedLinks = form.links.filter(
			(l) => l.url.trim().length > 0 || (l.note && l.note.trim().length > 0),
		);
		const payload: NominationFormValues = {
			...form,
			title: form.title.trim(),
			artist: form.artist.trim(),
			sheetNote: form.sheetNote?.trim() || "",
			links: cleanedLinks,
		};

		try {
			setIsSubmitting(true);
			if (mode === "create") {
				await addNomination(String(gigId), payload);
				toast.success(`'${payload.title}' 후보곡이 성공적으로 추천되었습니다!`);
			} else {
				if (!initialData) return;
				await updateNomination(String(gigId), initialData.id, payload);
				toast.success("후보곡 정보가 수정되었습니다.");
			}
			// 등록/수정 완료 시 선곡회의 페이지로 이동
			markSubmitting();
			router.push(`/gigs/${gigId}/nominations`);
		} catch (err: unknown) {
			console.error("저장 실패:", err);
			const msg =
				err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
			toast.error(msg);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async () => {
		if (!initialData) return;
		const confirmed = window.confirm(
			`'${initialData.title}' 추천곡을 정말 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.`,
		);
		if (!confirmed) return;

		try {
			setIsDeleting(true);
			await deleteNomination(String(gigId), initialData.id);
			toast.success("후보곡이 삭제되었습니다.");
			markSubmitting();
			router.push(`/gigs/${gigId}/nominations`);
		} catch (err: unknown) {
			console.error("삭제 실패:", err);
			const msg =
				err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.";
			toast.error(msg);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleCancel = () => {
		triggerConfirm(() => {
			router.push(`/gigs/${gigId}/nominations`);
		});
	};

	return (
		<div className="w-full max-w-3xl mx-auto pb-24 space-y-6 animate-in fade-in duration-200">
			{/* 1. 상단 내비게이션 & 헤더 */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={handleCancel}
						className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
					>
						<ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
						<span>선곡회의로 돌아가기</span>
					</button>

					<div className="text-xs text-muted-foreground font-medium">
						{gigTitle} &gt; {mode === "create" ? "후보곡 추천" : "후보곡 수정"}
					</div>
				</div>

				<div className="flex items-center justify-between gap-4 pb-2 border-b border-border/80">
					<div className="flex items-center gap-3">
						<div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
							<Music2 className="size-5" />
						</div>
						<div>
							<h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
								{mode === "create" ? "새로운 곡 추천하기" : "추천곡 정보 수정"}
							</h1>
							<p className="text-xs text-muted-foreground">
								{mode === "create"
									? "선곡 회의 후보곡 및 필요 세션을 등록합니다."
									: "곡 기본 정보, 필요 세션, 참고 링크 및 어필을 수정합니다."}
							</p>
						</div>
					</div>

					{mode === "create" && (
						<Badge
							variant="outline"
							className="hidden sm:inline-flex items-center gap-1 text-xs py-1 px-2.5 font-bold text-primary bg-primary/5 border-primary/20"
						>
							<Sparkles className="size-3" />
							후보곡 등록
						</Badge>
					)}
				</div>
			</div>

			{/* 2. 메인 폼 본문 (Enter 키에 의한 자동 제출 방지) */}
			<form
				onSubmit={handleSubmit}
				onKeyDown={(e) => {
					// Textarea가 아닌 일반 인풋 필드에서 Enter 입력 시 실수로 폼이 제출되지 않도록 방지
					if (
						e.key === "Enter" &&
						(e.target as HTMLElement).tagName !== "TEXTAREA"
					) {
						e.preventDefault();
					}
				}}
				className="space-y-6"
			>
				{/* 2.1 기본 곡 정보 카드 */}
				<div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-5">
					<h3 className="text-sm font-bold text-foreground">1. 곡 기본 정보</h3>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold">곡 제목 *</Label>
							<Input
								value={form.title}
								onChange={(e) =>
									setForm((p) => ({ ...p, title: e.target.value }))
								}
								placeholder="예: 사건의 지평선"
								required
								className="h-10 text-sm"
							/>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold">아티스트 *</Label>
							<Input
								value={form.artist}
								onChange={(e) =>
									setForm((p) => ({ ...p, artist: e.target.value }))
								}
								placeholder="예: 윤하"
								required
								className="h-10 text-sm"
							/>
						</div>
					</div>

					{/* 악보 유무 세그먼트 버튼 & 악보 메모 */}
					<div className="space-y-2">
						<Label className="text-xs font-semibold">악보 보유 여부</Label>
						<div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/80 text-xs font-bold max-w-sm">
							<button
								type="button"
								onClick={() => setForm((p) => ({ ...p, sheetExists: true }))}
								className={cn(
									"py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer",
									form.sheetExists
										? "bg-background text-foreground shadow-xs border border-border/50"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Check className="size-3.5 text-emerald-600" />
								악보 있어요
							</button>
							<button
								type="button"
								onClick={() => setForm((p) => ({ ...p, sheetExists: false }))}
								className={cn(
									"py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer",
									!form.sheetExists
										? "bg-background text-foreground shadow-xs border border-border/50"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<X className="size-3.5 text-muted-foreground" />
								악보 없어요
							</button>
						</div>

						{/* 악보 메모 필드 (폭 확장 및 넘칠 경우 멀티라인 지원) */}
						<div className="pt-1 w-full max-w-2xl">
							<Textarea
								value={form.sheetNote || ""}
								onChange={(e) =>
									setForm((p) => ({ ...p, sheetNote: e.target.value }))
								}
								placeholder="악보 메모 (보유 파트, 키 정보, 악보 링크 등 선택 입력)"
								rows={2}
								className="w-full min-h-[52px] text-xs bg-muted/30 focus-visible:bg-background rounded-xl p-2.5 resize-y leading-relaxed border-border/80"
							/>
						</div>
					</div>
				</div>

				{/* 2.2 세션 섹션 카드 */}
				<div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<h3 className="text-sm font-bold text-foreground">2. 필요 세션 *</h3>
							<div className="relative sm:hidden inline-flex items-center">
								<button
									type="button"
									onClick={() => setShowSessionHelp((prev) => !prev)}
									className="text-muted-foreground hover:text-foreground p-0.5 rounded-full"
									title="세션 안내"
								>
									<CircleHelp className="size-3.5" />
								</button>
								{showSessionHelp && (
									<div
										className="absolute left-0 top-full mt-1.5 z-30 w-64 p-2.5 rounded-xl bg-popover text-popover-foreground text-[11px] shadow-lg border border-border"
										onClick={() => setShowSessionHelp(false)}
									>
										+ 버튼을 클릭하여 필요한 세션을 추가해주세요. 아래에 선택된 세션을 클릭하여 제거할 수 있어요.
									</div>
								)}
							</div>
						</div>
						<span className="hidden sm:inline text-[11px] text-muted-foreground">
							+ 버튼으로 필요한 세션을 추가하세요. 선택된 세션 배지를 클릭하면 제거됩니다.
						</span>
					</div>

					{/* 프리셋 세션 버튼들 및 직접 입력 */}
					<div className="flex flex-wrap gap-1.5 items-center">
						{DEFAULT_SESSIONS.map((p) => (
							<Badge
								key={p}
								variant="outline"
								className="cursor-pointer h-8 px-3 rounded-lg hover:bg-muted hover:text-foreground hover:border-primary/50 transition-all text-xs font-medium border-border/80 bg-background"
								onClick={() => handleAddPart(p)}
							>
								<Plus className="size-3 mr-1 text-muted-foreground" /> {p}
							</Badge>
						))}
						<div className="relative flex items-center">
							<Plus className="absolute left-2.5 size-3 text-muted-foreground pointer-events-none" />
							<Input
								className="h-8 w-28 pl-7 pr-2.5 text-xs rounded-lg border-dashed bg-transparent focus-visible:ring-1 focus-visible:w-32 transition-all border-border"
								placeholder="직접 입력"
								value={newPart}
								onChange={(e) => setNewPart(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleAddPart(newPart);
									}
								}}
							/>
						</div>
					</div>

					{/* 선택된 세션 목록 */}
					<div className="space-y-1.5 pt-1">
						<div className="flex items-center justify-between text-xs px-0.5">
							<span className="text-muted-foreground font-medium text-[11px]">
								선택된 세션
							</span>
							<span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
								총 {form.requiredParts.length}명
							</span>
						</div>

						<div className="flex flex-wrap gap-2 p-3 border border-border/80 rounded-2xl bg-muted/20 min-h-[72px] items-start content-start shadow-inner">
							{uniqueParts.map((name) => {
								const count = form.requiredParts.filter((p) => p === name).length;
								return (
									<button
										key={`part-${name}`}
										type="button"
										onClick={() => handleRemovePart(name)}
										className="group h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs select-none bg-primary/10 text-primary border-primary/25 hover:bg-primary/20"
										title="클릭하여 1명 제거"
									>
										<span>{name}</span>
										<span className="font-extrabold bg-background/80 px-1.5 py-0.2 rounded text-[11px] border border-border/50">
											{count}
										</span>
										<X className="size-3 text-muted-foreground group-hover:text-destructive transition-colors ml-0.5" />
									</button>
								);
							})}
							{form.requiredParts.length === 0 && (
								<div className="m-auto text-muted-foreground text-xs py-4 text-center">
									상단에서 필요한 악기 및 세션을 추가해주세요.
								</div>
							)}
						</div>
					</div>

					{/* 추천 보컬 선택기 */}
					<div className="pt-2">
						<RecommendedVocalSelector
							selectedVocals={form.recommendedVocals || []}
							onChange={(vocals) =>
								setForm((prev) => ({ ...prev, recommendedVocals: vocals }))
							}
							performers={performers}
						/>
					</div>
				</div>

				{/* 2.3 어필 섹션 (기본 높이 5줄 이상: min-h-[130px]) */}
				<div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
					<div>
						<h3 className="text-sm font-bold text-foreground">3. 어필 및 제안 메모</h3>
						<p className="text-xs text-muted-foreground">
							이 곡을 추천하는 이유나 편곡 방향, 키 조절 계획 등을 자유롭게 적어주세요.
						</p>
					</div>

					<Textarea
						value={form.description}
						onChange={(e) =>
							setForm((p) => ({ ...p, description: e.target.value }))
						}
						placeholder="예: 원곡보다 반키 낮춰서 진행하면 보컬 음역대에 잘 맞을 것 같습니다. 2절 솔로 사운드를 강조해보면 좋겠습니다."
						rows={5}
						className="min-h-[130px] text-sm leading-relaxed"
					/>
				</div>

				{/* 2.4 참고 링크 섹션 */}
				<div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
					<div className="flex items-center justify-between">
						<div>
							<h3 className="text-sm font-bold text-foreground">4. 참고 링크</h3>
							<p className="text-xs text-muted-foreground">
								유튜브 영상이나 음원 링크를 등록하고, 타임스탬프와 설명을 남길 수 있습니다.
							</p>
						</div>
					</div>

					<div className="space-y-3.5">
						{form.links.map((refItem, idx) => (
							<LinkPreviewItem
								key={idx}
								index={idx}
								link={refItem}
								onUpdate={updateRef}
								onRemove={(i) => {
									const nextLinks = form.links.filter((_, idx2) => idx2 !== i);
									setForm((prev) => ({
										...prev,
										links:
											nextLinks.length > 0
												? nextLinks
												: [{ url: "", note: "", timestamp: "" }],
									}));
								}}
							/>
						))}
					</div>

					<Button
						type="button"
						variant="outline"
						onClick={() =>
							setForm((prev) => ({
								...prev,
								links: [...prev.links, { url: "", note: "", timestamp: "" }],
							}))
						}
						className="w-full h-10 border-dashed border-border/80 hover:border-primary/50 hover:bg-primary/5 text-xs font-semibold gap-1.5 transition-all"
					>
						<Plus className="size-3.5" />
						참고 링크 추가하기
					</Button>
				</div>

				{/* 2.5 하단 액션 버튼 바 */}
				<div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-xs">
					<div>
						{mode === "edit" && canDelete && (
							<Button
								type="button"
								variant="destructive"
								size="sm"
								disabled={isSubmitting || isDeleting}
								onClick={handleDelete}
								className="h-10 text-xs font-bold gap-1.5 cursor-pointer"
							>
								{isDeleting ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Trash2 className="size-3.5" />
								)}
								<span>추천곡 삭제하기</span>
							</Button>
						)}
					</div>

					<div className="flex items-center gap-2.5 ml-auto">
						<Button
							type="button"
							variant="outline"
							onClick={handleCancel}
							className="h-10 px-4 text-xs font-semibold cursor-pointer"
						>
							취소
						</Button>
						<Button
							type="submit"
							disabled={isSubmitting || isDeleting || form.requiredParts.length === 0}
							className="h-10 px-5 text-xs font-bold cursor-pointer"
						>
							{isSubmitting ? (
								<>
									<Loader2 className="size-3.5 mr-1.5 animate-spin" />
									{mode === "create" ? "등록 중..." : "저장 중..."}
								</>
							) : mode === "create" ? (
								"후보곡 등록하기"
							) : (
								"수정 완료"
							)}
						</Button>
					</div>
				</div>
			</form>

			{/* 이탈 방지 확인 모달 */}
			<LeaveConfirmDialog
				isOpen={showLeaveModal}
				onClose={cancelLeave}
				onConfirm={confirmLeave}
			/>
		</div>
	);
}
