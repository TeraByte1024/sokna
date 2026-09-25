import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function SiteLayout({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-svh flex-col pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
			<SiteHeader />
      <div className="flex-1 w-full flex flex-col gap-12 sm:gap-20 items-center">
				{children}
			</div>
			<SiteFooter />
		</main>
	);
}
