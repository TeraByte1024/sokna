"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { CalendarDays, House, UserRound } from "lucide-react";
import { CLUB_NAME_KOREAN } from "@/lib/club";
import { cn } from "@/lib/utils";

const mobileLinks = [
  { href: "/", label: "홈", icon: House },
  { href: "/gigs", label: "공연", icon: CalendarDays },
  { href: "/profile", label: "프로필", icon: UserRound },
];

interface SiteHeaderClientProps {
  authButton: React.ReactNode;
}

export function SiteHeaderClient({ authButton }: SiteHeaderClientProps) {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 flex w-full items-center justify-center border-b border-foreground/10 bg-background/90 backdrop-blur-md">
        <div className="flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-5 text-sm md:h-16">
          <div className="flex min-w-0 items-center gap-5 font-semibold">
            <Link href="/" className="flex shrink-0 items-center transition-opacity hover:opacity-90">
              <Image
                src="/logo.svg"
                alt={CLUB_NAME_KOREAN}
                width={160}
                height={40}
                className="h-4 w-auto object-contain invert"
                priority
              />
            </Link>

            <nav className="hidden items-center md:flex" aria-label="주요 메뉴">
              <Link
                href="/gigs"
                aria-current={pathname === "/gigs" || pathname.startsWith("/gigs/") ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === "/gigs" || pathname.startsWith("/gigs/")
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                공연
              </Link>
            </nav>
          </div>
          <div className="shrink-0">{authButton}</div>
        </div>
      </header>

      <nav
        aria-label="모바일 주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-3 px-3">
          {mobileLinks.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.4]")} aria-hidden="true" />
                <span className={cn(active && "font-bold")}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
