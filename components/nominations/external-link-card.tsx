"use client";

import { useState, useMemo } from "react";
import {
	ExternalLink,
	Copy,
	Check,
	Globe,
	Music2,
	Cloud,
	FileText,
	Radio,
	Disc3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatExternalLink } from "@/lib/nomination";

export interface ServiceInfo {
	name: string;
	category: string;
	iconType: "youtube" | "drive" | "spotify" | "soundcloud" | "music" | "sheet" | "web";
	themeColor: string;
}

export function detectServiceInfo(rawUrl: string): { domain: string; service: ServiceInfo } {
	let domain = "";
	const safeUrl = formatExternalLink(rawUrl);

	try {
		const parsed = new URL(safeUrl);
		domain = parsed.hostname.replace(/^www\./, "");
	} catch {
		domain = rawUrl;
	}

	const d = domain.toLowerCase();
	const u = rawUrl.toLowerCase();

	if (d.includes("drive.google.com") || d.includes("docs.google.com")) {
		return {
			domain,
			service: {
				name: "Google Drive",
				category: "클라우드 자료",
				iconType: "drive",
				themeColor: "text-sky-500 bg-sky-500/10 border-sky-500/30",
			},
		};
	}
	if (d.includes("spotify.com")) {
		return {
			domain,
			service: {
				name: "Spotify",
				category: "음원 스트리밍",
				iconType: "spotify",
				themeColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
			},
		};
	}
	if (d.includes("soundcloud.com")) {
		return {
			domain,
			service: {
				name: "SoundCloud",
				category: "음원 스트리밍",
				iconType: "soundcloud",
				themeColor: "text-amber-500 bg-amber-500/10 border-amber-500/30",
			},
		};
	}
	if (d.includes("melon.com")) {
		return {
			domain,
			service: {
				name: "Melon",
				category: "음원 스트리밍",
				iconType: "music",
				themeColor: "text-teal-500 bg-teal-500/10 border-teal-500/30",
			},
		};
	}
	if (d.includes("bugs.co.kr")) {
		return {
			domain,
			service: {
				name: "Bugs",
				category: "음원 스트리밍",
				iconType: "music",
				themeColor: "text-orange-500 bg-orange-500/10 border-orange-500/30",
			},
		};
	}
	if (d.includes("genie.co.kr")) {
		return {
			domain,
			service: {
				name: "지니뮤직",
				category: "음원 스트리밍",
				iconType: "music",
				themeColor: "text-blue-500 bg-blue-500/10 border-blue-500/30",
			},
		};
	}
	if (d.includes("music.apple.com")) {
		return {
			domain,
			service: {
				name: "Apple Music",
				category: "음원 스트리밍",
				iconType: "music",
				themeColor: "text-rose-500 bg-rose-500/10 border-rose-500/30",
			},
		};
	}
	if (
		d.includes("akbobada.com") ||
		d.includes("akbonara.co.kr") ||
		d.includes("mymusicsheet.com") ||
		d.includes("chordwiki") ||
		u.includes("sheet") ||
		u.includes("score")
	) {
		return {
			domain,
			service: {
				name: "악보/스코어",
				category: "악보 자료",
				iconType: "sheet",
				themeColor: "text-violet-500 bg-violet-500/10 border-violet-500/30",
			},
		};
	}

	return {
		domain,
		service: {
			name: domain || "외부 웹사이트",
			category: "외부 링크",
			iconType: "web",
			themeColor: "text-primary bg-primary/10 border-primary/30",
		},
	};
}

function ServiceIcon({ iconType, className }: { iconType: ServiceInfo["iconType"]; className?: string }) {
	switch (iconType) {
		case "drive":
			return <Cloud className={className} />;
		case "spotify":
			return <Disc3 className={className} />;
		case "soundcloud":
			return <Radio className={className} />;
		case "music":
			return <Music2 className={className} />;
		case "sheet":
			return <FileText className={className} />;
		case "web":
		default:
			return <Globe className={className} />;
	}
}

interface ExternalLinkCardProps {
	url: string;
	note?: string;
	className?: string;
	compact?: boolean;
}

export function ExternalLinkCard({
	url,
	note,
	className,
	compact = false,
}: ExternalLinkCardProps) {
	const [copied, setCopied] = useState(false);
	const [faviconError, setFaviconError] = useState(false);

	const safeUrl = useMemo(() => formatExternalLink(url), [url]);
	const { domain, service } = useMemo(() => detectServiceInfo(url), [url]);

	const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;

	const handleCopy = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(safeUrl);
			setCopied(true);
			toast.success("링크가 클립보드에 복사되었습니다.");
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("클립보드 복사 실패:", err);
			toast.error("링크 복사에 실패했습니다.");
		}
	};

	const handleOpen = () => {
		if (!safeUrl) return;
		window.open(safeUrl, "_blank", "noopener,noreferrer");
	};

	return (
		<div
			className={cn(
				"group relative w-full rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/40 p-4 sm:p-5 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md flex flex-col justify-between text-left",
				compact ? "min-h-[140px]" : "min-h-[160px] sm:min-h-[180px]",
				className,
			)}
		>
			{/* 상단: 서비스 뱃지 & 도메인 */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<div className="size-6 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/60">
						{faviconUrl && !faviconError ? (
							<img
								src={faviconUrl}
								alt=""
								className="size-4 object-contain"
								onError={() => setFaviconError(true)}
							/>
						) : (
							<ServiceIcon iconType={service.iconType} className="size-3.5 text-foreground" />
						)}
					</div>
					<span className="font-bold text-xs text-foreground truncate">{service.name}</span>
					<span className="text-[11px] text-muted-foreground font-mono truncate hidden sm:inline">
						({domain})
					</span>
				</div>

				<Badge variant="outline" className={cn("text-[10px] px-2 py-0 font-semibold border", service.themeColor)}>
					{service.category}
				</Badge>
			</div>

			{/* 중앙: 메모 / 타이틀 및 URL */}
			<div className="my-3 space-y-1">
				<h4 className="text-sm sm:text-base font-bold text-foreground line-clamp-2 break-keep group-hover:text-primary transition-colors">
					{note?.trim() || `${service.name} 바로가기`}
				</h4>
				<p className="text-[11px] font-mono text-muted-foreground truncate opacity-80" title={safeUrl}>
					{safeUrl}
				</p>
			</div>

			{/* 하단 액션 버튼 */}
			<div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
				<Button
					type="button"
					size="sm"
					onClick={handleOpen}
					className="h-8 px-3 text-xs font-bold gap-1.5 rounded-xl shadow-xs cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
				>
					<ExternalLink className="size-3.5" />
					<span>새 탭에서 열기</span>
				</Button>

				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={handleCopy}
					className="h-8 px-2.5 text-xs font-medium gap-1 rounded-xl cursor-pointer"
					title="링크 복사"
				>
					{copied ? (
						<>
							<Check className="size-3.5 text-emerald-500" />
							<span className="text-emerald-600 dark:text-emerald-400 font-semibold">복사됨!</span>
						</>
					) : (
						<>
							<Copy className="size-3.5 text-muted-foreground" />
							<span>복사</span>
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
