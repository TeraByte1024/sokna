"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { forwardRef, useMemo } from "react";
import { Reorder } from "framer-motion";
import {
	defaultRequiredParts,
	type SetlistFormValues,
	type SetlistLink,
} from "@/lib/setlist";
import { ReorderItemWrapper } from "@/components/setlists/reorder-item-wrapper";

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
				className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-1rem),35rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm outline-none"
			>
				<form onSubmit={onSubmit} className="flex flex-col max-h-[90vh]">
					<div className="px-6 py-5 border-b font-bold text-xl">
						새로운 곡 추천
					</div>

					<div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
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

						<div className="space-y-3 text-left">
							<Label className="text-[11px] text-slate-500 uppercase font-black tracking-widest ml-1">
								필요 세션 구성
							</Label>

							{/* 상단 버튼 영역 (줄바꿈 허용) */}
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
								axis="x" // 줄바꿈이 되더라도 기본 흐름은 가로(x)축 기준입니다.
								values={uniqueParts}
								onReorder={handleReorder}
								// layoutScroll 대신 layout을 사용하여 전체 배치가 바뀌게 함
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
										세션 버튼을 눌러 구성을 시작하세요.
									</div>
								)}
							</Reorder.Group>
						</div>

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
										className="flex gap-2 items-start bg-muted/20 p-2 rounded-lg border"
									>
										<div className="grid flex-1 gap-2">
											<Input
												placeholder="URL"
												value={refItem.url}
												onChange={(e) => updateRef(idx, "url", e.target.value)}
												className="h-8 text-xs font-mono"
											/>
											<Input
												placeholder="비고"
												value={refItem.note}
												onChange={(e) => updateRef(idx, "note", e.target.value)}
												className="h-8 text-xs"
											/>
										</div>
									</div>
								))}
							</div>
						</div>

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

					<div className="p-6 border-t flex justify-end gap-3 bg-muted/5">
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
