"use client";

import { useState, useMemo } from "react";
import { type RecommendedVocal } from "@/lib/nomination";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Search, X, Mic, Check, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendedVocalSelectorProps {
	selectedVocals: RecommendedVocal[];
	onChange: (vocals: RecommendedVocal[]) => void;
	performers: RecommendedVocal[];
}

export function RecommendedVocalSelector({
	selectedVocals,
	onChange,
	performers,
}: RecommendedVocalSelectorProps) {
	const [query, setQuery] = useState("");
	const [isFocused, setIsFocused] = useState(false);

	// 이미 선택된 id 셋
	const selectedIds = useMemo(
		() => new Set(selectedVocals.map((v) => v.id)),
		[selectedVocals],
	);

	// 검색어로 필터링 및 보컬 우선 정렬된 공연 참여자 목록
	const filteredPerformers = useMemo(() => {
		const q = query.trim().toLowerCase();
		const matched = !q
			? performers
			: performers.filter((p) => {
					const nameMatch = p.name.toLowerCase().includes(q);
					const partMatch = (p.part || "").toLowerCase().includes(q);
					const genMatch = p.generation ? `${p.generation}`.includes(q) : false;
					return nameMatch || partMatch || genMatch;
				});

		// 보컬 먼저 상단에 표시 (기수 순 보조 정렬)
		return [...matched].sort((a, b) => {
			const aIsVocal = (a.part || "").includes("보컬") ? 1 : 0;
			const bIsVocal = (b.part || "").includes("보컬") ? 1 : 0;
			if (aIsVocal !== bIsVocal) return bIsVocal - aIsVocal;
			return (a.generation || 0) - (b.generation || 0);
		});
	}, [performers, query]);

	const toggleVocal = (performer: RecommendedVocal) => {
		if (selectedIds.has(performer.id)) {
			onChange(selectedVocals.filter((v) => v.id !== performer.id));
		} else {
			onChange([...selectedVocals, performer]);
		}
	};

	const removeVocal = (id: number) => {
		onChange(selectedVocals.filter((v) => v.id !== id));
	};

	return (
		<div className="space-y-2.5">
			<div className="flex items-center justify-between">
				<Label className="text-xs font-semibold flex items-center gap-1.5">
					<Mic className="size-3.5 text-primary" />
					추천 보컬
				</Label>
				<span className="text-[11px] text-muted-foreground">
					어울리는 보컬을 추천해주세요.
				</span>
			</div>

			{/* 1. 선택된 추천 보컬 칩들 */}
			{selectedVocals.length > 0 && (
				<div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
					{selectedVocals.map((vocal) => (
						<Badge
							key={vocal.id}
							variant="secondary"
							className="h-7 pl-2.5 pr-1 gap-1 text-xs font-semibold bg-background border border-primary/30 text-foreground shadow-2xs hover:bg-background"
						>
							<span className="font-bold text-primary">
								{vocal.generation ? `${vocal.generation}기 ` : ""}
								{vocal.name}
							</span>
							{vocal.part && (
								<span className="text-[10px] text-muted-foreground">
									({vocal.part})
								</span>
							)}
							<button
								type="button"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									removeVocal(vocal.id);
								}}
								className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-colors cursor-pointer ml-0.5"
								title="제거"
							>
								<X className="size-3" />
							</button>
						</Badge>
					))}
				</div>
			)}

			{/* 2. 참여자 검색 및 선택 드롭다운/리스트 영역 */}
			<div className="space-y-1.5">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onFocus={() => setIsFocused(true)}
						placeholder="공연 참여자 이름, 기수, 파트 검색..."
						className="h-8 pl-8 text-xs bg-muted/30 focus-visible:bg-background"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						>
							<X className="size-3" />
						</button>
					)}
				</div>

				{/* 참여자 선택 그리드 (최대 높이 제한 및 스크롤) */}
				<div className="max-h-36 overflow-y-auto rounded-xl border border-border/70 bg-card p-1.5 space-y-0.5 shadow-inner [scrollbar-width:thin]">
					{filteredPerformers.length > 0 ? (
						filteredPerformers.map((p) => {
							const isSelected = selectedIds.has(p.id);
							const isVocalPart = (p.part || "").includes("보컬");
							return (
								<button
									key={p.id}
									type="button"
									onClick={() => toggleVocal(p)}
									className={cn(
										"w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer",
										isSelected
											? "bg-primary/10 text-primary font-bold border border-primary/30"
											: "hover:bg-muted text-foreground",
									)}
								>
									<div className="flex items-center gap-2 min-w-0">
										<div
											className={cn(
												"size-5 rounded-md flex items-center justify-center shrink-0 text-[10px]",
												isSelected
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground",
											)}
										>
											{isSelected ? (
												<Check className="size-3 stroke-[3]" />
											) : (
												<UserCheck className="size-3" />
											)}
										</div>
										<span className="truncate">
											{p.generation ? `${p.generation}기 ` : ""}
											{p.name}
										</span>
										{p.part && (
											<span
												className={cn(
													"text-[10px] px-1.5 py-0.2 rounded font-medium",
													isVocalPart
														? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
														: "bg-muted text-muted-foreground",
												)}
											>
												{p.part}
											</span>
										)}
									</div>
									<span className="text-[10px] text-muted-foreground shrink-0 ml-1">
										{isSelected ? "선택됨" : "+ 추가"}
									</span>
								</button>
							);
						})
					) : (
						<div className="py-4 text-center text-xs text-muted-foreground">
							{query
								? `'${query}' 검색 결과가 없습니다.`
								: "등록된 공연 참여자가 없습니다."}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
