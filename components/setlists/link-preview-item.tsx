"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	getYouTubeVideoId,
	extractYouTubeTimestamp,
	type SetlistLink,
} from "@/lib/setlist";
import { ClipboardPaste, X, Video, ExternalLink } from "lucide-react";
import { RichTimestampTextarea } from "@/components/setlists/rich-timestamp-textarea";
import { ExternalLinkCard } from "@/components/setlists/external-link-card";

interface LinkPreviewItemProps {
	index: number;
	link: SetlistLink;
	onUpdate: (
		index: number,
		field: "url" | "note" | "timestamp",
		value: string,
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

	const videoId = useMemo(() => getYouTubeVideoId(link.url), [link.url]);
	const initialTimestamp = useMemo(
		() => extractYouTubeTimestamp(link.url),
		[link.url],
	);

	const handleSeek = (seconds: number) => {
		setActiveSeekTime(seconds);
	};

	// 현재 시작 초 계산 (직접 클릭한 타임스탬프 > URL 쿼리 파라미터)
	const currentStartSeconds = activeSeekTime ?? initialTimestamp ?? null;

	const embedUrl = useMemo(() => {
		if (!videoId) return null;
		const base = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
		if (currentStartSeconds !== null) {
			return `${base}&start=${currentStartSeconds}&autoplay=1`;
		}
		return base;
	}, [videoId, currentStartSeconds]);

	return (
		<div className="flex flex-col gap-2.5 bg-card p-3 rounded-xl border border-border/80 shadow-xs transition-all">
			{/* 1행: URL 입력, 붙여넣기, 삭제 버튼 */}
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="h-8 px-2.5 text-[11px] shrink-0 gap-1"
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
					placeholder="https://youtu.be/... (유튜브 영상 링크)"
					value={link.url}
					onChange={(e) => {
						setActiveSeekTime(null);
						onUpdate(index, "url", e.target.value);
					}}
					className="h-8 text-xs font-mono flex-1"
				/>

				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
					onClick={() => onRemove(index)}
					title="링크 삭제"
				>
					<X className="size-3.5" />
				</Button>
			</div>

			{/* 2행: 영상 설명 입력 (텍스트 필드 내부에 타임스탬프 버튼 렌더링) */}
			<div className="pl-0.5">
				<RichTimestampTextarea
					value={link.note || ""}
					onChange={(text) => onUpdate(index, "note", text)}
					onSeek={(seconds) => handleSeek(seconds)}
					placeholder="영상 설명 (자유롭게 입력, 예: 원곡 라이브 영상입니다. 01:23 ~ 02:45 솔로 카피 필요, 03:10 브릿지)"
					className="h-[76px] resize-none"
				/>
			</div>

			{/* 4행: 실시간 영상 미리보기 플레이어 (유효한 유튜브 영상) 또는 외부 링크 배너 */}
			{embedUrl ? (
				<div className="mt-1 rounded-xl overflow-hidden border border-border/80 bg-black/5 shadow-inner">
					<div className="flex items-center justify-between px-2.5 py-1 bg-muted/40 border-b border-border/60 text-[11px] text-muted-foreground font-medium">
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
					<div className="relative aspect-video w-full bg-black/80 max-h-48 sm:max-h-56">
						<iframe
							src={embedUrl}
							title="YouTube video preview"
							className="w-full h-full border-0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowFullScreen
						/>
					</div>
				</div>
			) : link.url.trim().length > 0 ? (
				<div className="mt-1">
					<ExternalLinkCard
						url={link.url}
						note={link.note}
						compact
					/>
				</div>
			) : null}
		</div>
	);
}
