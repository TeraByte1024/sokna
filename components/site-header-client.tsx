"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, History, Users, Image as ImageIcon } from "lucide-react";
import { CLUB_NAME_KOREAN } from "@/lib/club";
import { motion, AnimatePresence } from "framer-motion";

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

interface SiteHeaderClientProps {
  authButton: React.ReactNode;
}

export function SiteHeaderClient({ authButton }: SiteHeaderClientProps) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);

  // 페이지 이동 시 확장된 메뉴 자동 접기
  useEffect(() => {
    setIsExpanded(false);
  }, [pathname]);

  // 접혀 있는 메뉴(역사, 부원, 갤러리) 중 현재 활성화된 페이지가 있는지 확인
  const isSecondaryActive = secondaryLinks.some(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  const renderNavLink = (link: NavLink, className?: string) => {
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
              ? "bg-accent text-accent-foreground font-semibold"
              : "text-muted-foreground hover:bg-accent",
          className,
        )}
      >
        {link.label}
      </Link>
    );
  };

  return (
    <header className="w-full flex flex-col items-center border-b border-b-foreground/10 sticky top-0 bg-background/80 backdrop-blur-md z-50">
      {/* 1. 상단 기본 메인 헤더 바 */}
      <div className="w-full max-w-5xl flex justify-between items-center h-16 p-3 px-3 sm:px-5 text-sm gap-2">
        <div className="flex items-center gap-2 sm:gap-5 font-semibold min-w-0">
          {/* 모바일 전용: 로고 왼쪽에 배치되는 'v' 형태의 expand 버튼 */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? "추가 메뉴 접기" : "추가 메뉴 펼치기"}
            className={cn(
              "md:hidden inline-flex items-center justify-center rounded-md p-1.5 text-xs font-medium transition-colors hover:bg-accent shrink-0",
              isSecondaryActive
                ? "bg-accent text-accent-foreground ring-1 ring-border font-semibold"
                : "text-muted-foreground",
            )}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                isExpanded && "rotate-180",
              )}
            />
          </button>

          {/* SOKNA 로고 */}
          <Link
            href="/"
            className="shrink-0 flex items-center hover:opacity-90 transition-opacity"
          >
            <Image
              src="/logo.svg"
              alt={CLUB_NAME_KOREAN}
              width={160}
              height={40}
              className="h-3.5 sm:h-4 w-auto object-contain invert"
              priority
            />
          </Link>

          {/* 메인 네비게이션 */}
          <nav className="flex items-center gap-1 min-w-0" aria-label="주요 메뉴">
            {/* '공연' 링크 (항상 노출) */}
            {renderNavLink(gigsLink)}

            {/* '역사', '부원', '갤러리' 링크 (데스크톱 md 이상에서만 인라인 노출) */}
            {secondaryLinks.map((link) => renderNavLink(link, "hidden md:inline-flex"))}

            {/* '🎂 40주년' 링크 (항상 노출) */}
            {renderNavLink(anniversaryLink)}
          </nav>
        </div>

        {/* 우측 인증/프로필 버튼 */}
        <div className="shrink-0">
          {authButton}
        </div>
      </div>

      {/* 2. 모바일 확장 서브 메뉴 (float 형태가 아닌 헤더가 아래로 확장되는 구조) */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="mobile-nav-expand-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full md:hidden overflow-hidden border-t border-border/40 bg-background/95 backdrop-blur-md"
          >
            <div className="w-full max-w-5xl mx-auto px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
              {secondaryLinks.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIsExpanded(false)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0",
                      active
                        ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
