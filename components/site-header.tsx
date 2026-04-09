import Link from "next/link";
import Image from "next/image"; // Image 컴포넌트 추가
import { Suspense } from "react";
import { AuthButton } from "@/components/auth-button";
import { SiteNav } from "@/components/site-nav";
import { CLUB_NAME_KOREAN } from "@/lib/club";

export function SiteHeader() {
	return (
		<header className="w-full flex justify-center border-b border-b-foreground/10 h-16">
			<div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
				<div className="flex flex-wrap gap-3 sm:gap-5 items-center font-semibold min-w-0">
					<Link
						href="/"
						className="shrink-0 flex items-center hover:opacity-90 transition-opacity"
					>
						<Image
							src="/logo.svg"
							alt={CLUB_NAME_KOREAN}
							width={160}
							height={40}
							className="h-4 w-auto object-contain invert" // invert 색 반전
							priority
						/>
					</Link>
					<Suspense fallback={<div className="w-20" />}>
						<SiteNav />
					</Suspense>
				</div>
				<Suspense>
					<AuthButton />
				</Suspense>
			</div>
		</header>
	);
}
