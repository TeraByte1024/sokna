"use client";

import { useCallback, useRef, useState, useTransition, useEffect } from "react";
import { useParams } from "next/navigation";
import { Plus, Loader2, AlarmClock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import {
	type Setlist,
	parseSetlist,
	defaultRequiredParts,
	SetlistFormValues,
} from "@/lib/setlist";

import { SetlistDrawer } from "@/components/setlists/setlist-drawer";
import { SetlistNewModal } from "@/components/setlists/setlist-new-modal";
import { addSetlist } from "@/app/gigs/[id]/setlists/actions";
import { cn } from "@/lib/utils";

const DEADLINE_COLUMN = "meeting_date";
const DEFAULT_REQUIRED_PARTS = defaultRequiredParts();
const DEFAULT_FORM_STATE: SetlistFormValues = {
	title: "",
	artist: "",
	requiredParts: [...DEFAULT_REQUIRED_PARTS],
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
	// 회의 날짜의 24시간 전(전날 같은 시간)을 실제 마감으로 설정
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

/**
 * 오늘 기준 D-Day 문자열 반환
 */
const getDDay = (targetDate: string) => {
	if (!targetDate) return "";

	const target = new Date(targetDate);
	const now = new Date();

	// 시간 제외하고 날짜만 비교
	now.setHours(0, 0, 0, 0);
	target.setHours(0, 0, 0, 0);

	const diffDays = Math.ceil(
		(target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays === 0) return "D-Day";
	return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
};

export function SetlistPanel() {
	const params = useParams();
	const gigId = params.id as string;
	const dialogRef = useRef<HTMLDialogElement>(null);
	const supabase = createClient();

	const [isPending, startTransition] = useTransition();
	const [songs, setSongs] = useState<Setlist[]>([]);
	const [selectedSong, setSelectedSong] = useState<Setlist | null>(null); // 서랍에 표시할 곡
	const [gigInfo, setGigInfo] = useState<{
		title: string;
		meetingDate: string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [timeLeft, setTimeLeft] = useState(getRemainingTime(""));

	const [form, setForm] = useState(DEFAULT_FORM_STATE);
	const [newPart, setNewPart] = useState("");

	useEffect(() => {
		async function init() {
			setIsLoading(true);
			try {
				const [gigRes, setlistRes] = await Promise.all([
					supabase
						.from("gigs")
						.select(`title, ${DEADLINE_COLUMN}`)
						.eq("id", gigId)
						.single(),
					supabase
						.from("setlists")
						.select(
							`*,
                created_by:performers (
									part,
									...users (
										name,
										generation
									)
								)
              `,
						)
						.eq("gig_id", gigId)
						.order("created_at", { ascending: false }),
				]);

				if (gigRes.data) {
					const mDate = gigRes.data[DEADLINE_COLUMN] || "";
					setGigInfo({
						title: gigRes.data.title || "무제",
						meetingDate: mDate,
					});
					setTimeLeft(getRemainingTime(mDate));
				}
				console.log(setlistRes.data);
				if (setlistRes.data) setSongs(setlistRes.data.map(parseSetlist));
			} finally {
				setIsLoading(false);
			}
		}
		init();
	}, [gigId, supabase]);

	useEffect(() => {
		if (!gigInfo?.meetingDate) return;
		const timer = setInterval(
			() => setTimeLeft(getRemainingTime(gigInfo.meetingDate)),
			60000,
		);
		return () => clearInterval(timer);
	}, [gigInfo?.meetingDate]);

	const resetForm = useCallback(() => {
		setForm(DEFAULT_FORM_STATE as Setlist);
		setNewPart("");
	}, []);

	// 4. 링크(refs) 업데이트 로직을 form 내부로 통합
	const updateRef = (idx: number, field: "url" | "note", val: string) => {
		setForm((prev) => {
			const nextLinks = [...prev.links];
			nextLinks[idx] = { ...nextLinks[idx], [field]: val };
			return { ...prev, links: nextLinks };
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		startTransition(async () => {
			try {
				await addSetlist(gigId, form);

				closeDialog();
				window.location.reload();
			} catch (e) {
				alert("저장에 실패했습니다: " + (e as Error).message);
			}
		});
	};

	if (isLoading)
		return (
			<div className="flex justify-center py-10">
				<Loader2 className="animate-spin text-muted-foreground" />
			</div>
		);

	const openDialog = () => {
		resetForm();
		dialogRef.current?.showModal();
	};
	const closeDialog = () => dialogRef.current?.close();

	return (
		<div className="relative flex flex-col gap-8 w-full max-w-5xl mx-auto px-4 pb-20">
			{/* 헤더 섹션 */}
			<div className="border-b pb-6 space-y-4">
				<h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
					{gigInfo?.meetingDate && (
						<Badge
							variant="default"
							className="text-xs px-2 py-0 h-5 bg-primary text-primary-foreground rounded font-bold"
						>
							{getDDay(gigInfo.meetingDate)}
						</Badge>
					)}
					<span>{gigInfo?.title} 선곡회의</span>
				</h1>

				<div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border border-dashed">
					<div className="text-sm font-medium w-full sm:w-auto text-left">
						{timeLeft.isOver ? (
							<span className="text-muted-foreground font-bold">
								곡 추천이 마감되었습니다.
							</span>
						) : (
							<div className="flex items-center gap-2 text-muted-foreground">
								<AlarmClock className="size-4 text-primary" />
								<span>
									추천 마감까지{" "}
									<span className="text-primary font-bold">
										{/* ✅ 상위 단위가 있으면 하위 단위를 표시하지 않는 로직 */}
										{timeLeft.dd > 0
											? `${timeLeft.dd}일`
											: timeLeft.hh > 0
												? `${timeLeft.hh}시간`
												: `${timeLeft.mm}분`}
									</span>{" "}
									남았어요.
								</span>
							</div>
						)}
					</div>
					<Button
						onClick={openDialog}
						size="lg"
						disabled={timeLeft.isOver}
						className="w-full sm:w-auto shadow-md"
					>
						<Plus className="size-4 mr-2" /> 곡 추천하기
					</Button>
				</div>
			</div>

			{/* 카드 리스트: 클릭 시 selectedSong 설정 */}
			<section className="grid gap-4">
				{songs.length === 0 ? (
					<Card className="bg-muted/10 border-dashed border-2 py-16 text-center text-muted-foreground">
						아직 추천된 곡이 없습니다.
					</Card>
				) : (
					songs.map((song) => (
						<div
							key={song.id}
							onClick={() => setSelectedSong(song)}
							className="cursor-pointer"
						>
							<SetlistCard song={song} />
						</div>
					))
				)}
			</section>

			{/* 등록 모달 */}
			<SetlistNewModal
				ref={dialogRef}
				form={form}
				setForm={setForm}
				// form 내부의 값을 꺼내서 전달
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
				newPart={newPart}
				setNewPart={setNewPart}
				isPending={isPending}
				onSubmit={handleSubmit}
				onClose={closeDialog}
			/>

			<SetlistDrawer
				song={selectedSong}
				onClose={() => setSelectedSong(null)}
			/>

			{/* 서랍 열렸을 때 배경 어둡게 처리 */}
			{selectedSong && (
				<div
					className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm transition-opacity"
					onClick={() => setSelectedSong(null)}
				/>
			)}
		</div>
	);
}

function SetlistCard({
	song,
}: {
	song: Setlist & {
		createdBy?: { name: string; part: string; generation: number };
	};
}) {
	// 중복된 파트 카운트 로직
	const partCounts = song.requiredParts.reduce(
		(acc, p) => {
			acc[p] = (acc[p] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);
	const uniqueParts = Array.from(new Set(song.requiredParts));

	return (
		<Card className="group hover:border-blue-400 transition-all shadow-sm overflow-hidden border-slate-200 bg-white">
			<CardContent className="p-5 space-y-4">
				{/* 1열: [곡 제목 - 아티스트] [악보 유무] */}
				<div className="flex items-baseline justify-between gap-2">
					<div className="flex items-baseline gap-2 min-w-0">
						<h3 className="text-lg font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
							{song.title}
						</h3>
						<span className="text-sm text-slate-500 font-medium truncate">
							- {song.artist}
						</span>
					</div>
					<span
						className={cn(
							"text-[12px] font-bold shrink-0 px-2 py-0.5 rounded-md",
							song.sheetExists
								? "text-slate-400 bg-slate-100"
								: "text-red-500 bg-red-50 border border-red-100",
						)}
					>
						악보 {song.sheetExists ? "있음" : "없음"}
					</span>
				</div>

				{/* 2열: 세션 구성 칩 & 작성자(이름+기수) */}
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-wrap gap-1.5 flex-1">
						{uniqueParts.map((part) => (
							<div
								key={part}
								className="flex items-center bg-slate-100 text-slate-700 rounded-2xl h-7 px-2.5 gap-1.5 border border-slate-200"
							>
								<span className="text-[11px] font-bold">{part}</span>
								<span className="text-[12px] font-extrabold">
									{partCounts[part]}
								</span>
							</div>
						))}
					</div>

					{/* 작성자 정보 */}
					<div className="shrink-0 text-[12px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
						{song.createdBy ? (
							<>
								<span className="mr-1 text-slate-400 font-medium">
									{song.createdBy.generation}기
								</span>
								<span className="text-slate-900">{song.createdBy.name}</span>
							</>
						) : (
							"알 수 없음"
						)}
					</div>
				</div>

				{/* 3열: 곡의 어필 (말줄임표 적용) */}
				{song.description && (
					<div className="pt-3 border-t border-slate-100">
						<p className="text-sm text-slate-600 ellipsis text-left">
							{song.description}
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
