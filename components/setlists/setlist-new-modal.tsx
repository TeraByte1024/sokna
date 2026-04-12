"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { forwardRef, useMemo } from "react";
import { Reorder, motion } from "framer-motion";
import {
	defaultRequiredParts,
	type SetlistFormValues,
	type SetlistLink,
} from "@/lib/setlist";
import { ReorderItemWrapper } from "@/components/setlists/reorder-item-wrapper";
import { X, ClipboardPaste } from "lucide-react";
import { cn } from "@/lib/utils";

interface SetlistNewModalProps {
	form: SetlistFormValues;
	setForm: React.Dispatch<React.SetStateAction<SetlistFormValues>>;
	parts: string[];
	setParts: (val: string[] | ((prev: string[]) => string[])) => void;
	newPart: string;
	setNewPart: (val: string) => void;
	refs: SetlistLink[];
	updateRef: (idx: number, field: "url" | "note", val: string) => void;
	isPending: boolean;
	onSubmit: (e: React.FormEvent) => void;
	onClose: () => void;
}

export const SetlistNewModal = forwardRef<
	HTMLDialogElement,
	SetlistNewModalProps
>(
	(
		{
			form,
			setForm,
			parts,
			setParts,
			refs,
			updateRef,
			newPart,
			setNewPart,
			isPending,
			onSubmit,
			onClose,
		},
		ref,
	) => {
		const DEFAULT_SESSIONS = defaultRequiredParts();
		const uniqueParts = useMemo(() => Array.from(new Set(parts)), [parts]);

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

		const handleReorder = (newOrder: string[]) => {
			const partCounts = parts.reduce(
				(acc, p) => {
					acc[p] = (acc[p] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>,
			);

			const reorderedFullList: string[] = [];
			newOrder.forEach((name) => {
				for (let i = 0; i < (partCounts[name] || 0); i++) {
					reorderedFullList.push(name);
				}
			});
			setParts(reorderedFullList);
		};

		return (
			<dialog
				ref={ref}
				// 💡 위치 교정: inset-0 m-auto를 사용하여 화면 정중앙 배치
				className="fixed inset-0 z-50 m-auto w-[min(calc(100vw-1rem),35rem)] rounded-2xl border bg-background p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm outline-none open:flex open:flex-col"
			>
				<form onSubmit={onSubmit} className="flex flex-col h-full max-h-[90vh]">
					{/* 헤더 */}
					<div className="px-6 py-5 border-b font-bold text-xl shrink-0">
						새로운 곡 추천
					</div>

					{/* 컨텐츠 영역: 스크롤바 숨김 처리 */}
					<div className="p-6 space-y-6 overflow-y-auto flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
						{/* 1. 곡 기본 정보 */}
						<div className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-2 text-left">
								<div className="space-y-2">
									<Label>곡 제목</Label>
									<Input
										value={form.title}
										onChange={(e) =>
											setForm((p) => ({ ...p, title: e.target.value }))
										}
										placeholder="노래 제목"
										required
									/>
								</div>
								<div className="space-y-2">
									<Label>아티스트</Label>
									<Input
										value={form.artist}
										onChange={(e) =>
											setForm((p) => ({ ...p, artist: e.target.value }))
										}
										placeholder="가수명"
										required
									/>
								</div>
							</div>

							{/* 2. 악보 유무 슬라이드 토글 */}
							<div className="space-y-2 px-1 text-left">
								<Label className="text-[11px] text-slate-500 uppercase font-black tracking-widest ml-1">
									악보 유무
								</Label>
								<div
									onClick={() =>
										setForm((p) => ({ ...p, sheetExists: !p.sheetExists }))
									}
									className="relative w-full h-12 bg-slate-100 rounded-xl p-1 cursor-pointer select-none border border-slate-200"
								>
									<motion.div
										className="absolute top-1 bottom-1 rounded-lg shadow-sm"
										initial={false}
										animate={{
											x: form.sheetExists ? "0%" : "100%",
											width: "calc(50% - 4px)",
											backgroundColor: form.sheetExists ? "#ffffff" : "#ef4444",
										}}
										// 💡 tween 타입을 사용하여 오버슈팅 현상 제거
										transition={{
											type: "tween",
											ease: "circOut",
											duration: 0.25,
										}}
									/>

									<div className="relative flex h-full items-center text-center font-bold text-xs uppercase tracking-tighter">
										<div
											className={cn(
												"flex-1 transition-colors duration-200 z-10",
												form.sheetExists ? "text-slate-900" : "text-slate-400",
											)}
										>
											O
										</div>
										<div
											className={cn(
												"flex-1 transition-colors duration-200 z-10",
												!form.sheetExists ? "text-white" : "text-slate-400",
											)}
										>
											X
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* 3. 필요 세션 섹션 */}
						<div className="space-y-3 text-left">
							<Label className="text-[11px] text-slate-500 uppercase font-black tracking-widest ml-1">
								필요 세션
							</Label>

							<div className="flex flex-wrap gap-2 px-1 py-2 items-center">
								{DEFAULT_SESSIONS.map((p) => (
									<Badge
										key={p}
										variant="secondary"
										className="cursor-pointer h-8 px-3.5 rounded-lg hover:bg-slate-800 hover:text-white transition-all text-[12px] font-semibold border-none"
										onClick={() => handleAddPart(p)}
									>
										+ {p}
									</Badge>
								))}
								<Input
									className="h-8 w-28 text-[12px] rounded-lg border-dashed bg-transparent px-3 focus-visible:ring-1 focus-visible:w-32 transition-all border-slate-300"
									placeholder="+ 직접 추가"
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

							<Reorder.Group
								axis="x"
								values={uniqueParts}
								onReorder={handleReorder}
								layout
								className="flex flex-wrap gap-3 p-4 border border-slate-200 rounded-xl bg-slate-50/50 min-h-[120px] items-start content-start transition-all shadow-inner overflow-hidden"
							>
								{uniqueParts.map((name) => (
									<ReorderItemWrapper
										key={`part-${name}`}
										name={name}
										count={parts.filter((p) => p === name).length}
										onRemove={handleRemovePart}
									/>
								))}
								{parts.length === 0 && (
									<div className="m-auto text-slate-400 text-[13px] font-medium py-8">
										필요한 세션을 추가해주세요
									</div>
								)}
							</Reorder.Group>
						</div>

						{/* 4. 참고 자료 (한 줄 배치 및 붙여넣기 기능) */}
						<div className="space-y-3 text-left">
							<div className="flex justify-between items-center">
								<Label className="text-xs text-muted-foreground uppercase font-black ml-1">
									참고 자료
								</Label>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => updateRef(refs.length, "url", "")}
									className="h-7 text-xs"
								>
									+ 추가
								</Button>
							</div>
							<div className="space-y-2">
								{refs.map((refItem, idx) => (
									<div
										key={idx}
										className="flex items-center gap-2 bg-muted/20 p-2 rounded-lg border"
									>
										<Button
											type="button"
											variant="secondary"
											size="sm"
											className="h-8 px-2 text-[11px] shrink-0 gap-1"
											onClick={async () => {
												try {
													const text = await navigator.clipboard.readText();
													updateRef(idx, "url", text);
												} catch (err) {
													console.error("클립보드 읽기 실패:", err);
												}
											}}
										>
											<ClipboardPaste className="size-3" />
											붙여넣기
										</Button>

										<Input
											placeholder="URL"
											value={refItem.url}
											onChange={(e) => updateRef(idx, "url", e.target.value)}
											className="h-8 text-xs font-mono flex-[2]"
										/>

										<Input
											placeholder="비고"
											value={refItem.note}
											onChange={(e) => updateRef(idx, "note", e.target.value)}
											className="h-8 text-xs flex-[1]"
										/>

										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
											onClick={() => {
												const nextLinks = refs.filter((_, i) => i !== idx);
												setForm((prev) => ({ ...prev, links: nextLinks }));
											}}
										>
											<X className="size-3" />
										</Button>
									</div>
								))}
							</div>
						</div>

						{/* 5. 설명 섹션 */}
						<div className="space-y-2 text-left">
							<Label className="ml-1">설명</Label>
							<Textarea
								value={form.description}
								onChange={(e) =>
									setForm((p) => ({ ...p, description: e.target.value }))
								}
								placeholder="공연하고 싶은 이유를 어필해주세요."
								rows={3}
							/>
						</div>
					</div>

					{/* 푸터 */}
					<div className="p-6 border-t flex justify-end gap-3 bg-muted/5 shrink-0">
						<Button type="button" variant="ghost" onClick={onClose}>
							취소
						</Button>
						<Button type="submit" disabled={isPending || parts.length === 0}>
							등록하기
						</Button>
					</div>
				</form>
			</dialog>
		);
	},
);

SetlistNewModal.displayName = "SetlistNewModal";
