"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLUB_NAME_ENGLISH, CLUB_NAME_KOREAN } from "@/lib/club";

export function Landing({
  isLoggedIn,
  activeNominationGig,
  upcomingBookingGig,
}: {
  isLoggedIn: boolean;
  activeNominationGig: { id: number; title: string | null } | null;
  upcomingBookingGig: { href: string; title: string | null } | null;
}) {
  return (
    <div className="landing-hero relative isolate flex w-full flex-1 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-20 opacity-[0.045] dark:opacity-[0.075]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />
      <section className="mx-auto flex w-full max-w-6xl items-center justify-center px-5 py-12 sm:px-8 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="w-full space-y-7 text-center sm:space-y-8"
        >
          <div className="space-y-4 sm:space-y-5">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-muted-foreground">
              {CLUB_NAME_ENGLISH} · Since 1986
            </p>
            <h1 className="text-balance text-[clamp(2.25rem,9vw,3.25rem)] font-black leading-[1.12] tracking-[-0.045em] text-foreground sm:text-6xl">
              {CLUB_NAME_KOREAN}
            </h1>
            <p className="mx-auto max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:text-base">
              한양대 X 한양여대 연합 밴드동아리
            </p>
          </div>

          {(upcomingBookingGig || activeNominationGig || !isLoggedIn) && (
            <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
              {upcomingBookingGig && (
                <Button asChild size="lg" className="h-12 w-full rounded-xl px-4 text-sm font-bold sm:h-11 sm:w-auto sm:px-6">
                  <Link
                    href={upcomingBookingGig.href}
                    aria-label={upcomingBookingGig.title ? `공연 예매하기 · ${upcomingBookingGig.title}` : undefined}
                  >
                    <Ticket aria-hidden="true" className="size-4" />
                    공연 예매하기
                  </Link>
                </Button>
              )}
              {activeNominationGig && (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl px-4 text-sm font-bold sm:h-11 sm:px-6"
                >
                  <Link
                    href={`/gigs/${activeNominationGig.id}/nominations`}
                    aria-label={`${activeNominationGig.title || "공연"} 선곡회의 바로가기`}
                  >
                    선곡회의 바로가기
                  </Link>
                </Button>
              )}
              {!isLoggedIn && (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl px-4 text-sm font-bold sm:h-11 sm:px-6"
                >
                  <Link href="/auth/login">회원 로그인</Link>
                </Button>
              )}
            </div>
          )}
        </motion.div>
      </section>
    </div>
  );
}
