import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-12 sm:gap-20 items-center">
        <SiteHeader />
        <div className="flex-1 flex flex-col gap-12 max-w-5xl w-full p-5">
          {children}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
