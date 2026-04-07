"use client";

import { useEffect, useState } from "react";
import { Setlist } from "@/lib/setlist";
import {
	Link as LinkIcon,
	X,
	Music,
	User,
	CalendarDays,
	History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

interface SetlistDrawerProps {
	song: Setlist | null;
	onClose: () => void;
}

interface UserInfo {
	generation: number;
	name: string;
}

export function SetlistDrawer({ song, onClose }: SetlistDrawerProps) {
	const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
	const supabase = createClient();

	// 추천인 정보 가져오기 (UUID 기반)
	useEffect(() => {
		if (!song?.createdBy) return;

		async function fetchUser() {
			const { data, error } = await supabase
				.from("users")
				.select("generation, name")
				.eq("id", song?.createdBy)
				.single();

			if (!error && data) setUserInfo(data);
		}
		fetchUser();
	}, [song?.createdBy, supabase]);

	return (
		<>
			{/* Drawer 본체 */}
			<aside
				className={`fixed inset-y-0 right-0 z-[100] w-full max-w-md bg-background shadow-2xl border-l transition-transform duration-300 ease-in-out transform ${
					song ? "translate-x-0" : "translate-x-full"
				}`}
			>
				{song && (
					<div className="flex flex-col h-full">
						{/* 헤더 */}
						<div className="flex items-center justify-between p-6 border-b">
							<h2 className="text-lg font-bold text-muted-foreground flex items-center gap-2">
								<Music className="size-4" /> 곡 상세 정보
							</h2>
							<Button
								variant="ghost"
								size="icon"
								onClick={onClose}
								className="rounded-full"
							>
								<X className="size-5" />
							</Button>
						</div>

						{/* 메인 컨텐츠 */}
						<div className="flex-1 overflow-y-auto p-8 space-y-10 text-left custom-scrollbar">
							{/* 제목 섹션 */}
							<div className="space-y-3">
								<h3 className="text-3xl font-black leading-tight tracking-tight">
									{song.title}{" "}
									<span className="text-muted-foreground/50 font-light mx-1">
										—
									</span>{" "}
									{song.artist}
								</h3>

								{/* 추천인 정보 */}
								<div className="flex items-center gap-2 text-primary font-semibold bg-primary/5 w-fit px-3 py-1 rounded-full text-sm">
									<User className="size-4" />
									{userInfo
										? `${userInfo.generation}기 ${userInfo.name}`
										: "정보를 불러오는 중..."}
								</div>
							</div>

							{/* 필요 세션 (Part Chip 스타일) */}
							<div className="space-y-4">
								<h4 className="text-xs uppercase tracking-widest font-black text-muted-foreground/70">
									Required Parts
								</h4>
								<div className="flex flex-wrap gap-2">
									{song.requiredParts.map((part) => (
										<Badge
											key={part}
											variant="secondary"
											className="px-4 py-1.5 text-sm font-bold bg-muted border-none hover:bg-primary hover:text-primary-foreground transition-colors cursor-default"
										>
											{part}
										</Badge>
									))}
								</div>
							</div>

							{/* 설명 섹션 */}
							{song.description && (
								<div className="space-y-4">
									<h4 className="text-xs uppercase tracking-widest font-black text-muted-foreground/70">
										Description
									</h4>
									<div className="bg-muted/30 p-5 rounded-2xl border border-dashed border-muted-foreground/20 leading-relaxed text-foreground/90 whitespace-pre-wrap italic shadow-inner">
										{song.description}
									</div>
								</div>
							)}

							{/* 링크 섹션 (Notion Embed 스타일) */}
							{song.links && song.links.length > 0 && (
								<div className="space-y-4 pt-4">
									<h4 className="text-xs uppercase tracking-widest font-black text-muted-foreground/70">
										References
									</h4>
									<div className="grid gap-3">
										{song.links.map((link, idx) => (
											<a
												key={idx}
												href={link.url}
												target="_blank"
												rel="noreferrer"
												className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 hover:border-primary/50 transition-all group shadow-sm"
											>
												<div className="shrink-0 size-10 bg-muted flex items-center justify-center rounded-lg group-hover:bg-primary/10 transition-colors">
													<LinkIcon className="size-5 text-muted-foreground group-hover:text-primary" />
												</div>
												<div className="flex flex-col min-w-0 flex-1">
													<span className="font-bold text-sm truncate group-hover:text-primary transition-colors">
														{link.note || "참고 자료"}
													</span>
													<span className="text-xs text-muted-foreground truncate opacity-70">
														{link.url}
													</span>
												</div>
											</a>
										))}
									</div>
								</div>
							)}
						</div>

						{/* 푸터 (등록/수정 일시) */}
						<div className="p-6 border-t bg-muted/20 space-y-1">
							<div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground font-medium">
								<span className="flex items-center gap-1">
									<CalendarDays className="size-3" /> 최초 등록:{" "}
									{new Date(song.createdAt).toLocaleString()}
								</span>
								{song.updatedAt && (
									<span className="flex items-center gap-1">
										<History className="size-3" /> 최종 수정:{" "}
										{new Date(song.updatedAt).toLocaleString()}
									</span>
								)}
							</div>
						</div>
					</div>
				)}
			</aside>

			{/* Backdrop (배경 어둡게) */}
			<div
				className={`fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
					song ? "opacity-100 visible" : "opacity-0 invisible"
				}`}
				onClick={onClose}
			/>
		</>
	);
}
