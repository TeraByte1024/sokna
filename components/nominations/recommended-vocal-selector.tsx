"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { type RecommendedVocal } from "@/lib/nomination";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, X, Mic, Check, Plus, UserCheck } from "lucide-react";
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
	const [isSearching, setIsSearching] = useState(false);
	const [query, setQuery] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

	// 이미 선택된 id 셋
	const selectedIds = useMemo(
		() => new Set(selectedVocals.map((v) => v.id)),
		[selectedVocals],
	);

	// 검색창 열릴 때 자동 포커스 및 하이라이트 초기화
	useEffect(() => {
		if (isSearching) {
			inputRef.current?.focus();
			setHighlightedIndex(0);
		} else {
			setHighlightedIndex(-1);
		}
	}, [isSearching]);

	// 바깥 클릭 시 검색 팝업 닫기
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsSearching(false);
				setQuery("");
				setHighlightedIndex(-1);
			}
		};

		if (isSearching) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isSearching]);

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

	// 쿼리 변경 시 첫 번째 항목 자동 하이라이트
	useEffect(() => {
		setHighlightedIndex(filteredPerformers.length > 0 ? 0 : -1);
	}, [query, filteredPerformers.length]);

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

	// 방향키 및 엔터 키 네비게이션
	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			setIsSearching(false);
			setQuery("");
			setHighlightedIndex(-1);
			return;
		}

		if (filteredPerformers.length === 0) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlightedIndex((prev) => {
				const next = prev < filteredPerformers.length - 1 ? prev + 1 : 0;
				itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
				return next;
			});
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlightedIndex((prev) => {
				const next = prev > 0 ? prev - 1 : filteredPerformers.length - 1;
				itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
				return next;
			});
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (highlightedIndex >= 0 && highlightedIndex < filteredPerformers.length) {
				toggleVocal(filteredPerformers[highlightedIndex]);
			}
		}
	};

	return (
		<div className="space-y-2" ref={containerRef}>
			<div className="flex items-center justify-between">
				<Label className="text-xs font-semibold flex items-center gap-1.5">
					<Mic className="size-3.5 text-primary" />
					추천 보컬
				</Label>
				<span className="text-[11px] text-muted-foreground">
					어울리는 보컬을 추천해주세요. (선택)
				</span>
			</div>

			{/* 선택된 추천 보컬 칩 + [+ 추가] 버튼 영역 */}
			<div className="flex flex-wrap items-center gap-1.5 min-h-[36px] p-1.5 rounded-xl bg-muted/20 border border-border/70">
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

				{/* + 추가 버튼 (검색 모드가 아닐 때) */}
				{!isSearching && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsSearching(true)}
						className="h-7 px-2.5 text-xs font-medium gap-1 text-muted-foreground hover:text-primary hover:border-primary/50 border-dashed cursor-pointer"
					>
						<Plus className="size-3 text-primary" />
						<span>추가</span>
					</Button>
				)}

				{selectedVocals.length === 0 && !isSearching && (
					<span className="text-xs text-muted-foreground pl-1.5">
						지정된 추천 보컬이 없습니다.
					</span>
				)}
			</div>

			{/* 검색 모드 활성화 시: 검색 인풋 및 플로팅 드롭다운 팝업 */}
			{isSearching && (
				<div className="relative z-40">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
						<Input
							ref={inputRef}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="참여자 이름, 기수, 파트 검색... (방향키 이동, Enter 선택, ESC 닫기)"
							className="h-8 pl-8 pr-7 text-xs bg-background shadow-xs focus-visible:ring-1"
						/>
						<button
							type="button"
							onClick={() => {
								setIsSearching(false);
								setQuery("");
								setHighlightedIndex(-1);
							}}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded-full cursor-pointer"
							title="닫기"
						>
							<X className="size-3.5" />
						</button>
					</div>

					{/* 플로팅 검색 결과 팝업 */}
					<div
						tabIndex={-1}
						className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-1.5 space-y-0.5 shadow-xl [scrollbar-width:thin] z-50"
					>
						{filteredPerformers.length > 0 ? (
							filteredPerformers.map((p, index) => {
								const isSelected = selectedIds.has(p.id);
								const isVocalPart = (p.part || "").includes("보컬");
								const isHighlighted = highlightedIndex === index;

								return (
									<button
										key={p.id}
										ref={(el) => {
											itemRefs.current[index] = el;
										}}
										type="button"
										onMouseEnter={() => setHighlightedIndex(index)}
										onClick={() => toggleVocal(p)}
										className={cn(
											"w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer",
											isSelected
												? "bg-primary/10 text-primary font-bold border border-primary/30"
												: "hover:bg-muted text-foreground",
											isHighlighted && !isSelected && "bg-muted/80 ring-1 ring-primary/40",
											isHighlighted && isSelected && "ring-2 ring-primary",
										)}
									>
										<div className="flex items-center gap-2 min-w-0">
											<div
												className={cn(
													"size-4 rounded flex items-center justify-center shrink-0 text-[10px]",
													isSelected
														? "bg-primary text-primary-foreground"
														: "bg-muted text-muted-foreground",
												)}
											>
												{isSelected ? (
													<Check className="size-2.5 stroke-[3]" />
												) : (
													<UserCheck className="size-2.5" />
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
			)}
		</div>
	);
}
