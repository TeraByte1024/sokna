"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
	getYouTubeVideoId,
	extractYouTubeTimestamp,
	parseTimestampToSeconds,
	stripLeadingZeroTime,
	type NominationLink,
	type NominationTimestamp,
} from "@/lib/nomination";
import { ClipboardPaste, X, Video, ExternalLink, Clock, Play, Trash2 } from "lucide-react";
import { ExternalLinkCard } from "@/components/nominations/external-link-card";
import { TimestampBuilder } from "@/components/nominations/timestamp-builder";

interface LinkPreviewItemProps {
	index: number;
	link: NominationLink;
	onUpdate: (
		index: number,
		field: "url" | "note" | "timestamp" | "timestamps",
		value: any,
	) => void;
	onRemove: (index: number) => void;
}

export function LinkPreviewItem({
	index,
	link,
	onUpdate,
	onRemove,
}: LinkPreviewItemProps) {
	const [activeSeekTime, setActiveSeekTime] = useState<number | null>(null);
	const [pendingTimestamp, setPendingTimestamp] = useState<string | null>(null);

	// 실시간 재생 시각(초)을 추적하기 위한 Ref
	const liveCurrentTimeRef = useRef<number>(0);
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const trimmedUrl = (link.url || "").trim();
	const videoId = useMemo(() => getYouTubeVideoId(trimmedUrl), [trimmedUrl]);
	const initialTimestamp = useMemo(
		() => extractYouTubeTimestamp(trimmedUrl),
		[trimmedUrl],
	);

	// postMessage를 통한 YouTube 플레이어 실시간 시간 추적
	useEffect(() => {
		if (!videoId) return;

		const handleWindowMessage = (event: MessageEvent) => {
			try {
				let data = event.data;
				if (typeof data === "string") {
					data = JSON.parse(data);
				}
				if (data && data.event === "infoDelivery" && data.info) {
					if (typeof data.info.currentTime === "number") {
						liveCurrentTimeRef.current = data.info.currentTime;
					}
				}
			} catch {
				// 무시 (다른 postMessage 이벤트)
			}
		};

		window.addEventListener("message", handleWindowMessage);

		// YouTube iframe에 listening 이벤트 전송 (연결 수립)
		const interval = setInterval(() => {
			if (iframeRef.current?.contentWindow) {
				iframeRef.current.contentWindow.postMessage(
					JSON.stringify({ event: "listening" }),
					"*",
				);
			}
		}, 1000);

		return () => {
			window.removeEventListener("message", handleWindowMessage);
			clearInterval(interval);
		};
	}, [videoId]);

	// 시간 점프 (Seek) 핸들러 (postMessage)
	const handleSeek = useCallback((seconds: number) => {
		setActiveSeekTime(seconds);
		liveCurrentTimeRef.current = seconds;

		if (iframeRef.current?.contentWindow) {
			iframeRef.current.contentWindow.postMessage(
				JSON.stringify({
					event: "command",
					func: "seekTo",
					args: [seconds, true],
				}),
				"*",
			);
			iframeRef.current.contentWindow.postMessage(
				JSON.stringify({
					event: "command",
					func: "playVideo",
					args: [],
				}),
				"*",
			);
		}
	}, []);

	// 현재 활성화된 시작 초 (직접 클릭한 탐색 초 또는 URL 파라미터 초)
	const currentStartSeconds = activeSeekTime ?? (initialTimestamp && initialTimestamp > 0 ? initialTimestamp : null);

	// iframe 초기 로딩용 URL (autoplay 없이 즉시 안정 로드 보장)
	const embedUrl = useMemo(() => {
		if (!videoId) return null;
		let base = `https://www.youtube.com/embed/${videoId}?rel=0&enablejsapi=1`;
		if (initialTimestamp !== null && initialTimestamp > 0) {
			base += `&start=${initialTimestamp}`;
		}
		return base;
	}, [videoId, initialTimestamp]);

	// 현재 재생 시점 캡처하여 타임스탬프 추가 트리거 (0 strip 적용)
	const handleCaptureCurrentTime = () => {
		// 1. 영상 일시정지
		if (iframeRef.current?.contentWindow) {
			iframeRef.current.contentWindow.postMessage(
				JSON.stringify({
					event: "command",
					func: "pauseVideo",
					args: [],
				}),
				"*",
			);
		}

		// 2. 캡처된 초 계산
		let seconds = Math.floor(liveCurrentTimeRef.current);
		if (seconds <= 0 && currentStartSeconds !== null) {
			seconds = currentStartSeconds;
		}

		// 3. 선행 0 제거 (분: toString(), 초: padStart(2, '0'))
		const mm = Math.floor(seconds / 60).toString();
		const ss = (seconds % 60).toString().padStart(2, "0");
		setPendingTimestamp(`${mm}:${ss}`);
	};

	// 타임스탬프 목록 조작 핸들러
	const currentTimestamps: NominationTimestamp[] = useMemo(() => {
		return link.timestamps || [];
	}, [link.timestamps]);

	const handleAddTimestamp = (item: { time: string; label: string }) => {
		const next = [
			...currentTimestamps,
			{
				id: `ts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				time: item.time,
				label: item.label,
			},
		];
		onUpdate(index, "timestamps", next);
	};

	const handleRemoveTimestamp = (tsIndex: number) => {
		const next = currentTimestamps.filter((_, i) => i !== tsIndex);
		onUpdate(index, "timestamps", next);
	};

	return (
		<div className="flex flex-col gap-3.5 bg-card p-3.5 sm:p-4 rounded-2xl border border-border/80 shadow-xs transition-all">
			{/* 1. 참고 링크 입력 줄 */}
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="h-8 px-2.5 text-[11px] shrink-0 gap-1 cursor-pointer"
					onClick={async () => {
						try {
							const text = await navigator.clipboard.readText();
							onUpdate(index, "url", text);
						} catch (err) {
							console.error("클립보드 읽기 실패:", err);
						}
					}}
				>
					<ClipboardPaste className="size-3" />
					붙여넣기
				</Button>

				<Input
					placeholder="https://youtu.be/... 또는 웹 링크"
					value={link.url}
					onChange={(e) => {
						setActiveSeekTime(null);
						liveCurrentTimeRef.current = 0;
						onUpdate(index, "url", e.target.value);
					}}
					className="h-8 text-xs font-mono flex-1"
				/>

				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
					onClick={() => onRemove(index)}
					title="링크 삭제"
				>
					<X className="size-3.5" />
				</Button>
			</div>

			{/* ========================================================= */}
			{/* A. 유튜브 영상인 경우: 2. 미리보기 -> 3. 타임스탬프 -> 4. 설명 */}
			{/* ========================================================= */}
			{videoId && embedUrl ? (
				<>
					{/* 2. 영상 미리보기 */}
					<div className="rounded-xl overflow-hidden border border-border/80 bg-black/5 shadow-inner">
						<div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40 border-b border-border/60 text-[11px] text-muted-foreground font-medium">
							<div className="flex items-center gap-1.5">
								<Video className="size-3 text-primary" />
								<span>영상 미리보기</span>
								{currentStartSeconds !== null && (
									<span className="font-mono text-[10px] text-primary font-bold">
										({Math.floor(currentStartSeconds / 60)}:
										{(currentStartSeconds % 60).toString().padStart(2, "0")}~)
									</span>
								)}
							</div>
							<div className="flex items-center gap-2">
								<a
									href={link.url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-0.5 hover:text-primary transition-colors text-[10px]"
								>
									새 탭에서 열기
									<ExternalLink className="size-2.5" />
								</a>
							</div>
						</div>
						<div className="relative aspect-video w-full bg-black/80 max-h-52 sm:max-h-60">
							<iframe
								ref={iframeRef}
								id={`yt-player-${index}`}
								key={videoId}
								src={embedUrl}
								title="YouTube video preview"
								loading="eager"
								referrerPolicy="strict-origin-when-cross-origin"
								className="w-full h-full border-0"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
								allowFullScreen
							/>
						</div>
					</div>

					{/* 3. 타임스탬프 (별도 목록 및 추가 툴바) */}
					<div className="space-y-2.5 pt-0.5">
						<div className="flex flex-wrap items-center justify-between gap-1.5">
							<span className="text-xs font-semibold text-foreground flex items-center gap-1">
								<Clock className="size-3.5 text-primary" />
								<span>타임스탬프 목록</span>
							</span>
							<div className="flex items-center gap-1.5">
								{initialTimestamp !== null && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											const m = Math.floor(initialTimestamp / 60).toString();
											const s = (initialTimestamp % 60).toString().padStart(2, "0");
											setPendingTimestamp(`${m}:${s}`);
										}}
										className="h-7 px-2 text-[11px] font-semibold gap-1 text-primary border-primary/30 hover:bg-primary/10 cursor-pointer"
										title="URL 파라미터 시각을 타임스탬프로 가져옵니다"
									>
										<Clock className="size-3" />
										<span>
											URL 시각(
											{Math.floor(initialTimestamp / 60)}:
											{(initialTimestamp % 60).toString().padStart(2, "0")})
										</span>
									</Button>
								)}
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={handleCaptureCurrentTime}
									className="h-7 px-2.5 text-[11px] font-bold gap-1 text-primary bg-primary/10 hover:bg-primary/20 border border-primary/25 shadow-2xs cursor-pointer"
									title="재생 중인 영상의 현재 시점을 즉시 캡처하여 타임스탬프를 만듭니다"
								>
									<Clock className="size-3 text-primary animate-pulse" />
									<span>현재 시점 설명 추가</span>
								</Button>
							</div>
						</div>

						{/* 등록된 타임스탬프 칩 리스트 */}
						{currentTimestamps.length > 0 ? (
							<div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-muted/20 border border-border/70">
								{currentTimestamps.map((ts, tsIdx) => {
									const firstPart = ts.time.split("~")[0].trim();
									const sec = parseTimestampToSeconds(firstPart);
									const displayTime = stripLeadingZeroTime(ts.time);
									const hasLabel = Boolean(
										ts.label &&
											ts.label.trim() &&
											ts.label.trim() !== "주요 구간" &&
											ts.label.trim() !== "지정 구간" &&
											ts.label.trim() !== "시작 지점",
									);
									return (
										<div
											key={ts.id || `ts-${tsIdx}`}
											className="inline-flex items-center flex-wrap gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border/80 shadow-2xs text-xs max-w-full"
										>
											<button
												type="button"
												onClick={() => {
													if (sec !== null) handleSeek(sec);
												}}
												className="font-mono font-bold text-primary hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
												title="클릭하여 해당 구간으로 영상 이동"
											>
												<Play className="size-2.5 fill-primary text-primary shrink-0" />
												<span>{displayTime}</span>
											</button>
											{hasLabel ? (
												<span className="text-foreground/90 font-medium break-words whitespace-normal">
													{ts.label}
												</span>
											) : null}
											<button
												type="button"
												onClick={() => handleRemoveTimestamp(tsIdx)}
												className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-0.5 shrink-0 cursor-pointer"
												title="타임스탬프 삭제"
											>
												<X className="size-3" />
											</button>
										</div>
									);
								})}
							</div>
						) : null}

						{/* 타임스탬프 추가 빌더 위젯 */}
						<TimestampBuilder
							onAddTimestamp={handleAddTimestamp}
							onSeek={handleSeek}
							externalTimestamp={pendingTimestamp}
							onClearExternalTimestamp={() => setPendingTimestamp(null)}
						/>
					</div>

					{/* 4. 설명 (순수 텍스트에어리어, 기본 5줄 이상) */}
					<div className="space-y-1">
						<label className="text-xs font-semibold text-muted-foreground">
							설명
						</label>
						<Textarea
							value={link.note || ""}
							onChange={(e) => onUpdate(index, "note", e.target.value)}
							rows={5}
							placeholder="영상 관련 설명이나 참고 사항을 자유롭게 적어주세요. (선택)"
							className="min-h-[130px] text-xs resize-y leading-relaxed bg-background"
						/>
					</div>
				</>
			) : link.url.trim().length > 0 ? (
				/* ========================================================= */
				/* B. 비유튜브 링크인 경우: 2. 외부 링크 배너 -> 3. 설명 (타임스탬프 숨김) */
				/* ========================================================= */
				<>
					<div>
						<ExternalLinkCard
							url={link.url}
							note={link.note}
							compact
						/>
					</div>

					<div className="space-y-1">
						<label className="text-xs font-semibold text-muted-foreground">
							설명
						</label>
						<Textarea
							value={link.note || ""}
							onChange={(e) => onUpdate(index, "note", e.target.value)}
							rows={5}
							placeholder="링크 관련 설명이나 참고 사항을 적어주세요. (선택)"
							className="min-h-[130px] text-xs resize-y leading-relaxed bg-background"
						/>
					</div>
				</>
			) : null}
		</div>
	);
}
