"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, History, Users, Image as ImageIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavLink {
  href: string;
  label: string;
  highlight?: boolean;
}

interface SecondaryNavLink extends NavLink {
  icon: React.ComponentType<{ className?: string }>;
}

const gigsLink: NavLink = { href: "/gigs", label: "공연" };

const secondaryLinks: SecondaryNavLink[] = [
  { href: "/history", label: "역사", icon: History },
  { href: "/members", label: "부원", icon: Users },
  { href: "/photos", label: "갤러리", icon: ImageIcon },
];

const anniversaryLink: NavLink = {
  href: "/40th-anniversary",
  label: "🎂 40주년",
  highlight: true,
};

export function SiteNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // 모바일에서 접혀 있는 메뉴(역사, 부원, 갤러리) 중 현재 활성화된 페이지가 있는지 확인
  const isSecondaryActive = secondaryLinks.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  const renderLink = (link: NavLink, className?: string) => {
    const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
    return (
      <Link
        key={link.href}
        href={link.href}
        className={cn(
          "rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition-colors shrink-0",
          link.highlight
            ? active
              ? "bg-amber-500/15 text-amber-500 font-bold"
              : "text-amber-500/80 hover:bg-amber-500/10 hover:text-amber-500 font-bold"
            : active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent",
          className,
        )}
      >
        {link.label}
      </Link>
    );
  };

  return (
    <nav className="flex items-center gap-1 min-w-0" aria-label="주요 메뉴">
      {/* 1. 모바일 전용: 가장 왼쪽에 위치하는 'v' 형태의 expand 버튼 (역사, 부원, 갤러리 메뉴 접힘) */}
      <div className="md:hidden shrink-0">
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="더 많은 메뉴 펼치기"
              className={cn(
                "inline-flex items-center justify-center rounded-md p-1.5 text-xs sm:text-sm font-medium transition-colors hover:bg-accent",
                isSecondaryActive
                  ? "bg-accent text-accent-foreground ring-1 ring-border font-semibold"
                  : "text-muted-foreground",
              )}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36 mt-1">
            {secondaryLinks.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <DropdownMenuItem key={href} asChild>
                  <Link
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer font-medium w-full",
                      active && "bg-accent text-accent-foreground font-semibold",
                    )}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{label}</span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 2. '공연' 링크: 항상 노출 */}
      {renderLink(gigsLink)}

      {/* 3. '역사', '부원', '갤러리' 링크: 데스크톱(md 이상)에서만 인라인 노출 */}
      {secondaryLinks.map((link) => renderLink(link, "hidden md:inline-flex"))}

      {/* 4. '🎂 40주년' 링크: 항상 노출 */}
      {renderLink(anniversaryLink)}
    </nav>
  );
}

