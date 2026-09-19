"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { forwardRef, useMemo, useState } from "react";
import {
	defaultRequiredParts,
	sortSessionParts,
	type NominationFormValues,
	type NominationLink,
	type RecommendedVocal,
} from "@/lib/nomination";
import { RecommendedVocalSelector } from "@/components/nominations/recommended-vocal-selector";
import { LinkPreviewItem } from "@/components/nominations/link-preview-item";
import {
	X,
	Music2,
	Check,
	Plus,
	Loader2,
	Clock,
	CircleHelp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NominationNewModalProps {
	form: NominationFormValues;
	setForm: React.Dispatch<React.SetStateAction<NominationFormValues>>;
	parts: string[];
	setParts: (val: string[] | ((prev: string[]) => string[])) => void;
	newPart: string;
	setNewPart: (val: string) => void;
	refs: NominationLink[];
	updateRef: (
		idx: number,
		field: "url" | "note" | "timestamp" | "timestamps",
		val: any,
	) => void;
	performers?: RecommendedVocal[];
	isPending: boolean;
	onSubmit: (e: React.FormEvent) => void;
	onClose: () => void;
}

export const NominationNewModal = forwardRef<
	HTMLDialogElement,
	NominationNewModalProps
>(
	(
		{
			form,
			setForm,
			parts,
			setParts,
			refs,
			updateRef,
			performers = [],
			newPart,
			setNewPart,
			isPending,
			onSubmit,
			onClose,
		},
		ref,
	) => {
		const [showSessionHelp, setShowSessionHelp] = useState(false);
		const DEFAULT_SESSIONS = defaultRequiredParts();
		const uniqueParts = useMemo(
			() => sortSessionParts(Array.from(new Set(parts))),
			[parts],
		);

		const handleAddPart = (name: string) => {
			const trimmed = name.trim();
			if (!trimmed) return;
			setParts((prev) => [...prev, trimmed]);
			setNewPart("");
		};

		const handleRemovePart = (name: string) => {
			setParts((prev) => {
				const idx = prev.lastIndexOf(name);
				if (idx > -1) {
					const newArr = [...prev];
					newArr.splice(idx, 1);
					return newArr;
				}
				return prev;
			});
		};

		return (
			<dialog
				ref={ref}
				className="fixed inset-0 z-50 m-auto w-[min(calc(100vw-1rem),35rem)] rounded-2xl border border-border bg-background p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-xs outline-none open:flex open:flex-col overflow-hidden"
			>
				<form onSubmit={onSubmit} className="flex flex-col h-full max-h-[90vh]">
					{/* 모달 헤더 */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-card/60 shrink-0">
						<div className="flex items-center gap-2">
							<div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
								<Music2 className="size-4" />
							</div>
							<div>
								<h2 className="text-base font-bold tracking-tight text-foreground">
									새로운 곡 추천
								</h2>
								<p className="text-[11px] text-muted-foreground">
									선곡 회의 후보곡 및 필요 세션 파트 등록
								</p>
							</div>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={onClose}
							className="rounded-full size-8 hover:bg-muted"
						>
							<X className="size-4" />
						</Button>
					</div>

					{/* 컨텐츠 스크롤 영역 */}
					<div className="p-6 space-y-6 overflow-y-auto flex-1 text-left [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
						{/* 1. 곡 기본 정보 */}
						<div className="space-y-4">
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
										className="h-10"
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
										className="h-10"
									/>
								</div>
							</div>

							{/* 2. 악보 유무 세그먼트 컨트롤러 */}
							<div className="space-y-1.5">
								<Label className="text-xs font-semibold">악보</Label>
								<div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/80 text-xs font-bold">
									<button
										type="button"
										onClick={() =>
											setForm((p) => ({ ...p, sheetExists: true }))
										}
										className={cn(
											"py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer",
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
										onClick={() =>
											setForm((p) => ({ ...p, sheetExists: false }))
										}
										className={cn(
											"py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer",
											!form.sheetExists
												? "bg-background text-foreground shadow-xs border border-border/50"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										<X className="size-3.5 text-muted-foreground" />
										악보 없어요
									</button>
								</div>
							</div>
						</div>

						{/* 3. 세션 섹션 */}
						<div className="space-y-2.5">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5">
									<Label className="text-xs font-semibold">
										세션 *
									</Label>
									{/* 모바일 ? 아이콘 툴팁 */}
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
									+ 버튼을 클릭하여 필요한 세션을 추가해주세요. 아래에 선택된 세션을 클릭하여 제거할 수 있어요.
								</span>
							</div>

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

							<div className="space-y-1.5">
								<div className="flex items-center justify-between text-xs px-0.5">
									<span className="text-muted-foreground font-medium text-[11px]">선택된 세션</span>
									<span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
										총 {parts.length}명
									</span>
								</div>

								<div className="flex flex-wrap gap-2 p-3 border border-border/80 rounded-xl bg-muted/20 min-h-[72px] items-start content-start shadow-inner">
									{uniqueParts.map((name) => {
										const count = parts.filter((p) => p === name).length;
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
									{parts.length === 0 && (
										<div className="m-auto text-muted-foreground text-xs py-4 text-center">
											상단에서 필요한 악기 및 세션 파트를 추가해주세요.
										</div>
									)}
								</div>
							</div>
						</div>

						{/* 4. 추천 보컬 섹션 (세션 다음 섹션) */}
						<RecommendedVocalSelector
							selectedVocals={form.recommendedVocals || []}
							onChange={(vocals) =>
								setForm((prev) => ({ ...prev, recommendedVocals: vocals }))
							}
							performers={performers}
						/>

						{/* 5. 참고 자료 (URL 및 메모) */}
						<div className="space-y-2.5">
							<Label className="text-xs font-semibold">
								참고 링크 (유튜브 음원/영상 등)
							</Label>

							<div className="space-y-2.5">
								{refs.map((refItem, idx) => (
									<LinkPreviewItem
										key={idx}
										index={idx}
										link={refItem}
										onUpdate={updateRef}
										onRemove={(i) => {
											const nextLinks = refs.filter((_, idx2) => idx2 !== i);
											setForm((prev) => ({ ...prev, links: nextLinks }));
										}}
									/>
								))}
							</div>

							{/* 기본으로 있는 입력란 아래에 넓게 배치된 링크 추가 버튼 */}
							<Button
								type="button"
								variant="outline"
								onClick={() => updateRef(refs.length, "url", "")}
								className="w-full h-9 border-dashed border-border/80 hover:border-primary/50 hover:bg-primary/5 text-xs font-medium gap-1.5 transition-all"
							>
								<Plus className="size-3.5" />
								참고 링크 추가하기
							</Button>

							{refs.length === 0 && (
								<p className="text-[11px] text-muted-foreground px-1">
									유튜브 링크 및 설명(예: 01:23 ~ 02:45 솔로)을 등록하면 상세 화면에서 바로 해당 구간을 청취할 수 있습니다.
								</p>
							)}
						</div>

						{/* 5. 어필 섹션 */}
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold">어필</Label>
							<Textarea
								value={form.description}
								onChange={(e) =>
									setForm((p) => ({ ...p, description: e.target.value }))
								}
								placeholder="이 곡을 추천하는 이유나 편곡 방향, 키 조절 계획 등을 어필해주세요."
								rows={5}
								className="text-xs min-h-[130px] resize-none"
							/>
						</div>
					</div>

					{/* 모달 푸터 */}
					<div className="p-4 px-6 border-t border-border/80 flex justify-end gap-2.5 bg-card/60 shrink-0">
						<Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs">
							취소
						</Button>
						<Button
							type="submit"
							disabled={isPending || parts.length === 0}
							className="h-9 text-xs font-bold"
						>
							{isPending ? (
								<>
									<Loader2 className="size-3.5 mr-1.5 animate-spin" />
									등록 중...
								</>
							) : (
								"후보곡 등록하기"
							)}
						</Button>
					</div>
				</form>
			</dialog>
		);
	},
);

NominationNewModal.displayName = "NominationNewModal";
export const SetlistNewModal = NominationNewModal;
