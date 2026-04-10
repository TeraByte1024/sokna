import Link from "next/link";
import Image from "next/image";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SiInstagram, SiYoutube } from '@icons-pack/react-simple-icons';

export function SiteFooter() {
	return (
		<footer className="w-full border-t bg-background">
			<div className="max-w-5xl mx-auto px-5 py-12 md:py-16">
				<div className="flex flex-col items-center gap-8 md:flex-row md:justify-between md:gap-0">
					{/* 1. 로고 및 저작권 섹션 */}
					<div className="flex flex-col items-center md:items-start gap-4">
						<Link
							href="/"
							className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity"
						>
							{/* 로고가 하얀색이라면 다크모드에서 invert 처리 등을 고려할 수 있습니다. 
                  기존 헤더 로직처럼 'dark:invert-0 invert' 클래스를 활용해 보세요. */}
							<Image
								src="/logo.svg"
								alt="SOKNA Logo"
								width={120}
								height={30}
								className="h-6 w-auto dark:invert-0 invert"
							/>
						</Link>
						<div className="text-center md:text-left">
							<p className="text-xs text-muted-foreground leading-relaxed">
								한양대학교 중앙 밴드 동아리 소리로 크는 나무
							</p>
							<p className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider">
								© 2026 SOKNA. All rights reserved.
							</p>
						</div>
					</div>

					{/* 2. SNS 및 테마 스위처 섹션 */}
					<div className="flex flex-col items-center md:items-end gap-6">
						{/* SNS 아이콘 레이아웃 */}
						<div className="flex items-center gap-5">
							<a
								href="https://www.instagram.com/sokna_1986/"
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground hover:text-pink-500 transition-colors"
								aria-label="Instagram"
							>
								<SiInstagram className="size-5 fill-current" />
							</a>
							<a
								href="https://www.youtube.com/@sokna_1986"
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground hover:text-red-600 transition-colors"
								aria-label="Youtube"
							>
								<SiYoutube className="size-5 fill-current" />
							</a>
							{/* 구분선 */}
							<div className="w-px h-4 bg-border mx-1" />
							{/* 테마 스위처 */}
							<ThemeSwitcher />
						</div>

						{/* 하단 Supabase 표기 (기존 내용 유지) */}
						<p className="text-[10px] text-muted-foreground/50">
							Powered by{" "}
							<a
								href="https://supabase.com/"
								target="_blank"
								className="font-medium hover:underline decoration-dotted"
								rel="noreferrer"
							>
								Supabase
							</a>
						</p>
					</div>
				</div>
			</div>
		</footer>
	);
}
