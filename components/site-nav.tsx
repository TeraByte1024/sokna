"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  highlight?: boolean;
}

const links: NavLink[] = [
  { href: "/gigs", label: "공연" },
  { href: "/history", label: "역사" },
  { href: "/members", label: "부원" },
  { href: "/photos", label: "갤러리" },
  { href: "/40th-anniversary", label: "40주년", highlight: true },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1" aria-label="주요 메뉴">
      {links.map(({ href, label, highlight }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              highlight
                ? active
                  ? "bg-amber-500/15 text-amber-500 font-bold"
                  : "text-amber-500/80 hover:bg-amber-500/10 hover:text-amber-500 font-bold"
                : active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
