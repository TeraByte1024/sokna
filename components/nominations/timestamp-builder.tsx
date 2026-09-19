"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Clock, Play, Check } from "lucide-react";
import { parseTimestampToSeconds } from "@/lib/nomination";

interface TimestampBuilderProps {
	onAddTimestamp: (item: { time: string; label: string }) => void;
	onSeek?: (seconds: number) => void;
	externalTimestamp?: string | null;
	onClearExternalTimestamp?: () => void;
}

export function TimestampBuilder({
	onAddTimestamp,
	onSeek,
	externalTimestamp,
	onClearExternalTimestamp,
}: TimestampBuilderProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [step, setStep] = useState<"time" | "desc">("time");
	const [timeInput, setTimeInput] = useState("");
	const [descInput, setDescInput] = useState("");

	const timeInputRef = useRef<HTMLInputElement>(null);
	const descInputRef = useRef<HTMLInputElement>(null);

	// 외부(예: 영상에서 '현재 시점 설명 추가' 클릭 시)에서 타임스탬프가 주입되었을 때
	useEffect(() => {
		if (externalTimestamp) {
			setTimeInput(externalTimestamp);
			setStep("desc");
			setIsOpen(true);
			setDescInput("");
			onClearExternalTimestamp?.();
			setTimeout(() => {
				descInputRef.current?.focus();
			}, 50);
		}
	}, [externalTimestamp, onClearExternalTimestamp]);

	// 위젯 오픈 시 포커스
	useEffect(() => {
		if (isOpen) {
			if (step === "time") {
				timeInputRef.current?.focus();
			} else if (step === "desc") {
				descInputRef.current?.focus();
			}
		}
	}, [isOpen, step]);

	const handleOpen = () => {
		setIsOpen(true);
		setStep("time");
		setTimeInput("");
		setDescInput("");
	};

	const handleCancel = useCallback(() => {
		setIsOpen(false);
		setStep("time");
		setTimeInput("");
		setDescInput("");
	}, []);

	// 단일 시각 포맷팅 (선행 0 제거)
	const formatSingleTime = (t: string): string => {
		const digits = t.replace(/[^\d:]/g, "");
		if (digits.includes(":")) {
			const parts = digits.split(":");
			if (parts.length === 2) {
				const [m, s] = parts;
				const mm = m ? parseInt(m, 10).toString() : "0";
				const ss = s ? s.padStart(2, "0").slice(0, 2) : "00";
				return `${isNaN(Number(mm)) ? "0" : mm}:${ss}`;
			}
			if (parts.length === 3) {
				const [h, m, s] = parts;
				const hh = parseInt(h, 10);
				const mm = m ? m.padStart(2, "0").slice(0, 2) : "00";
				const ss = s ? s.padStart(2, "0").slice(0, 2) : "00";
				return hh > 0 ? `${hh}:${mm}:${ss}` : `${parseInt(mm, 10)}:${ss}`;
			}
		}
		const num = parseInt(digits, 10);
		if (!isNaN(num)) {
			if (num < 60) return `0:${num.toString().padStart(2, "0")}`;
			if (num >= 100) {
				const m = Math.floor(num / 100);
				const s = num % 100;
				return `${m}:${s.toString().padStart(2, "0")}`;
			}
			const m = Math.floor(num / 60);
			const s = num % 60;
			return `${m}:${s.toString().padStart(2, "0")}`;
		}
		return digits || "0:00";
	};

	// 시작 시각 / 구간 시간 유효성 검사 및 정돈
	const cleanTimeString = useCallback((str: string): string => {
		const trimmed = str.trim();
		if (trimmed.includes("~") || trimmed.includes("-")) {
			const parts = trimmed.split(/[~-]/).map((p) => p.trim());
			if (parts.length >= 2) {
				const start = formatSingleTime(parts[0]);
				const end = formatSingleTime(parts[1]);
				return `${start} ~ ${end}`;
			}
		}
		return formatSingleTime(trimmed);
	}, []);

	// 입력 문자열에서 시간과 설명을 함께 분리 파싱
	const parseTimeAndDescription = useCallback((input: string): { time: string; desc: string } | null => {
		const raw = input.trim();
		if (!raw) return null;

		// 1. 시간 패턴 정규식: mm:s 또는 mm:ss 또는 hh:mm:ss 형태 또는 구간 형태 (초 단위 1자리도 허용 예: 02:5)
		const timeRegex = /(?:(?:\d{1,2}:)?\d{1,2}:\d{1,2})\s*(?:[~-]\s*(?:(?:\d{1,2}:)?\d{1,2}:\d{1,2}))?/;
		const match = raw.match(timeRegex);

		if (match && match.index !== undefined) {
			const rawTime = match[0];
			const before = raw.slice(0, match.index).trim();
			const after = raw.slice(match.index + rawTime.length).trim();

			// 설명 문자열 정돈 (앞뒤 괄호 및 구분 기호 정리)
			let desc = [before, after].filter(Boolean).join(" ");
			desc = desc.replace(/^[\]):,\-\s]+/, "").replace(/[\[\(,\-\s]+$/, "").trim();

			const formattedTime = cleanTimeString(rawTime);
			return {
				time: formattedTime,
				desc,
			};
		}

		// 만약 콜론 없는 숫자 형태(예: 0323)인 경우
		const cleaned = cleanTimeString(raw);
		if (cleaned) {
			return {
				time: cleaned,
				desc: "",
			};
		}

		return null;
	}, [cleanTimeString]);

	// 현재 timeInput에 설명 텍스트가 함께 포함되어 있는지 감지
	const parsedInline = useMemo(() => {
		return parseTimeAndDescription(timeInput);
	}, [timeInput, parseTimeAndDescription]);

	const handleConfirmTime = () => {
		if (!timeInput.trim()) {
			handleCancel();
			return;
		}

		const parsed = parseTimeAndDescription(timeInput);
		if (!parsed) {
			handleCancel();
			return;
		}

		// 설명까지 함께 입력된 경우: 즉시 타임스탬프 추가 완료!
		if (parsed.desc) {
			onAddTimestamp({
				time: parsed.time,
				label: parsed.desc,
			});
			handleCancel();
			return;
		}

		// 시간만 입력된 경우: 2단계(설명 입력)로 전환
		setTimeInput(parsed.time);
		setStep("desc");
		setTimeout(() => {
			descInputRef.current?.focus();
		}, 30);
	};

	const handleComplete = useCallback(() => {
		const finalTime = timeInput.trim();
		const finalDesc = descInput.trim();

		if (!finalTime) {
			handleCancel();
			return;
		}

		onAddTimestamp({
			time: finalTime,
			label: finalDesc,
		});
		handleCancel();
	}, [timeInput, descInput, onAddTimestamp, handleCancel]);

	const handlePreviewSeek = () => {
		const firstPart = timeInput.split("~")[0].trim();
		const sec = parseTimestampToSeconds(firstPart);
		if (sec !== null && onSeek) {
			onSeek(sec);
		}
	};

	if (!isOpen) {
		return (
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={handleOpen}
				className="h-7 px-2.5 text-xs border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/60 font-semibold gap-1.5 transition-all shadow-2xs cursor-pointer"
			>
				<Plus className="size-3.5" />
				<span>타임스탬프 추가</span>
			</Button>
		);
	}

	return (
		<div className="flex flex-col gap-2 p-2.5 rounded-xl border border-primary/30 bg-primary/5 shadow-xs animate-in fade-in zoom-in-95 duration-150 text-xs">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5 font-bold text-foreground text-[11px]">
					<Clock className="size-3.5 text-primary" />
					<span>타임스탬프 추가</span>
				</div>
				<button
					type="button"
					onClick={handleCancel}
					className="size-5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
					title="취소"
				>
					<X className="size-3.5" />
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{step === "time" ? (
					<div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
						<Input
							ref={timeInputRef}
							value={timeInput}
							onChange={(e) => setTimeInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleConfirmTime();
								} else if (e.key === "Escape") {
									handleCancel();
								}
							}}
							placeholder="시각/구간 및 설명 입력 (예: 01:23 기타 솔로, 1:20 ~ 2:10 브릿지)..."
							className="h-7 text-xs font-mono bg-background focus-visible:ring-1"
						/>
						<Button
							type="button"
							size="sm"
							onClick={handleConfirmTime}
							disabled={!timeInput.trim()}
							className="h-7 px-2.5 text-xs font-bold shrink-0 gap-1 cursor-pointer"
						>
							{parsedInline?.desc ? (
								<>
									<Check className="size-3" />
									<span>추가</span>
								</>
							) : (
								<span>다음</span>
							)}
						</Button>
					</div>
				) : (
					<div className="flex flex-wrap items-center gap-2 flex-1">
						{/* 고정된 시간 배지 */}
						<Badge
							variant="secondary"
							onClick={() => {
								setStep("time");
								handlePreviewSeek();
							}}
							className="h-7 px-2 text-xs font-mono font-bold bg-primary/15 text-primary border border-primary/30 flex items-center gap-1 cursor-pointer hover:bg-primary/20"
							title="클릭하여 시각 수정"
						>
							<Play className="size-2.5 fill-primary text-primary" />
							<span>{timeInput}</span>
						</Badge>

						{/* 설명 입력창 */}
						<div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
							<Input
								ref={descInputRef}
								value={descInput}
								onChange={(e) => setDescInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleComplete();
									} else if (e.key === "Escape") {
										handleCancel();
									}
								}}
								placeholder="설명 입력 (예: 기타 솔로, 2절 코러스)..."
								className="h-7 text-xs bg-background focus-visible:ring-1 flex-1"
							/>
							<Button
								type="button"
								size="sm"
								onClick={handleComplete}
								className="h-7 px-2.5 text-xs font-bold shrink-0 gap-1 bg-primary text-primary-foreground cursor-pointer"
							>
								<Check className="size-3" />
								<span>완료</span>
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
