"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, Menu, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin/approvals", label: "가입/공연 신청 승인", icon: ClipboardCheck },
  { href: "/admin/gigs", label: "공연 관리", icon: CalendarDays },
  { href: "/admin/members", label: "회원(관리자) 관리", icon: Users },
] as const;

function AdminLinks({ pathname, onNavigate, compact = false }: {
  pathname: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            title={label}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact && "xl:justify-center xl:px-2 min-[1440px]:justify-start min-[1440px]:px-3",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className={compact ? "hidden min-[1440px]:inline" : undefined}>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function AdminMenuDrawer() {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open || dialog.dataset.closing === "true") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.dataset.closing = "true";
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        variant="ghost"
        aria-label="관리자 메뉴 열기"
        aria-haspopup="dialog"
        aria-controls="admin-menu-drawer"
        className="shrink-0 xl:hidden"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>
      <dialog
        ref={dialogRef}
        id="admin-menu-drawer"
        aria-labelledby="admin-menu-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClose={(event) => {
          delete event.currentTarget.dataset.closing;
          triggerRef.current?.focus();
        }}
        onAnimationEnd={(event) => {
          if (event.animationName === "admin-drawer-exit") event.currentTarget.close();
        }}
        onClick={(event) => {
          const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
          if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) closeDrawer();
        }}
        className="admin-menu-drawer fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-72 max-w-[calc(100vw-3rem)] border-r border-border bg-card p-4 text-foreground shadow-2xl backdrop:bg-black/50"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="admin-menu-title" className="font-semibold">관리자 메뉴</h2>
          <Button type="button" size="icon" variant="ghost" aria-label="메뉴 닫기" onClick={closeDrawer}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <nav aria-label="관리자 메뉴">
          <AdminLinks pathname={pathname} onNavigate={closeDrawer} />
        </nav>
      </dialog>
    </>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <aside className="absolute right-[calc(100%+1rem)] top-0 hidden h-full w-[calc((100vw-64rem)/2-2rem)] max-w-52 xl:block">
      <nav aria-label="관리자 메뉴" className="sticky top-24 rounded-xl border border-border/70 bg-card p-1.5 shadow-sm min-[1440px]:p-3">
        <p className="hidden px-2 pb-2 text-xs font-semibold text-muted-foreground min-[1440px]:block">관리자 메뉴</p>
        <AdminLinks pathname={pathname} compact />
      </nav>
    </aside>
  );
}
