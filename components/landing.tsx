"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Construction,
  Music2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLUB_NAME_ENGLISH, CLUB_NAME_KOREAN } from "@/lib/club";
import { cn } from "@/lib/utils";

const STATUS_ITEMS = [
  {
    icon: CalendarDays,
    title: "공연 정보",
    description: "예정된 공연과 상세 정보를 확인할 수 있어요.",
  },
  {
    icon: Music2,
    title: "선곡 회의",
    description: "참여 중인 공연의 후보곡과 세션을 조율해요.",
  },
  {
    icon: Bell,
    title: "중요 알림",
    description: "기기 알림을 활성화하고 새 후보곡이 올라오면 알림으로 확인해요.",
  },
  {
    icon: Sparkles,
    title: "활동 기록",
    description: "동아리 소개와 활동을 정리해 기록할 예정이에요.",
  },
];

export function Landing({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="relative isolate w-full overflow-hidden border-b border-border/60 bg-background">
      <div
        className="pointer-events-none absolute inset-0 -z-20 opacity-[0.045] dark:opacity-[0.075]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />
      <div className="pointer-events-none absolute -left-40 top-16 -z-10 size-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 -z-10 size-[30rem] rounded-full bg-sky-500/10 blur-3xl" />

      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-12 pt-10 sm:gap-14 sm:px-8 sm:py-24 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-7 text-left sm:space-y-8 sm:text-center lg:text-left"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] font-black tracking-[0.16em] text-amber-700 dark:text-amber-300">
            <Construction className="size-3.5" />
            IN PROGRESS
          </div>

          <div className="space-y-4 sm:space-y-5">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-muted-foreground">
              {CLUB_NAME_ENGLISH} · Since 1986
            </p>
            <h1 className="text-balance text-[clamp(2.25rem,9vw,3.25rem)] font-black leading-[1.12] tracking-[-0.045em] text-foreground sm:text-6xl">
              {CLUB_NAME_KOREAN}
            </h1>
            <p className="max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:mx-auto sm:text-base lg:mx-0">
              한양대 X 한양여대 연합 밴드동아리
            </p>
          </div>

          <div
            className={cn(
              "gap-2.5 sm:flex sm:justify-center sm:gap-3 lg:justify-start",
              isLoggedIn ? "flex" : "grid grid-cols-2",
            )}
          >
            <Button asChild size="lg" className="h-12 rounded-xl px-2 text-sm font-bold sm:h-11 sm:px-6">
              <Link href="/gigs">
                공연 둘러보기
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {!isLoggedIn && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-xl px-2 text-sm font-bold sm:h-11 sm:px-6"
              >
                <Link href="/auth/login">회원 로그인</Link>
              </Button>
            )}
          </div>

        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-lg sm:mx-auto"
        >
          <div className="absolute -inset-5 -z-10 rounded-[2.25rem] bg-gradient-to-br from-violet-500/15 via-transparent to-sky-500/15 blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-2xl shadow-foreground/5 backdrop-blur-xl sm:rounded-[1.75rem]">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5 sm:py-3.5">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-rose-400/80" />
                <span className="size-2.5 rounded-full bg-amber-400/80" />
                <span className="size-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-muted-foreground">
                SOKNA 260923
              </span>
            </div>

            <div className="space-y-5 p-4 sm:space-y-7 sm:p-8">
              <div className="flex items-center gap-4">
                <div className="min-w-0 text-left">
                  <p className="truncate text-lg font-black tracking-tight">이 페이지는</p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    현재 개발 초기 단계로, 일부 기능이 불안정할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="grid gap-2.5">
                {STATUS_ITEMS.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-3 text-left sm:items-center sm:rounded-2xl sm:p-3.5"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">{title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
