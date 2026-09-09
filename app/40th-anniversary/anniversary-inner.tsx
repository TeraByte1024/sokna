"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Calendar,
  MapPin,
  Clock,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Music,
  Camera,
  Train,
  Car,
  ExternalLink,
} from "lucide-react";
import { ClubLogo } from "@/components/club-logo";
import { ANNIVERSARY_CONFIG } from "@/lib/anniversary";
import { cn } from "@/lib/utils";
import { AttendanceForm } from "./attendance-form";
import Link from "next/link";

/* ─── D-Day Countdown Logic ─── */

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(targetDate: string): TimeLeft {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

/* ─── Countdown Unit ─── */

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl sm:text-6xl lg:text-7xl font-black tabular-nums tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-amber-200">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-amber-300/70 mt-1.5 font-semibold">
        {label}
      </span>
    </div>
  );
}

/* ─── Timetable Category Styling ─── */

const CATEGORY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ceremony: {
    bg: "bg-amber-500/10 border-amber-500/20",
    text: "text-amber-400",
    dot: "bg-amber-500",
  },
  performance: {
    bg: "bg-rose-500/10 border-rose-500/20",
    text: "text-rose-400",
    dot: "bg-rose-500",
  },
  reception: {
    bg: "bg-emerald-500/10 border-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
  },
  break: {
    bg: "bg-slate-500/10 border-slate-500/20",
    text: "text-slate-400",
    dot: "bg-slate-500",
  },
};

/* ─── Fade-In Animation Wrapper ─── */

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Main Anniversary Inner Component ─── */

export function AnniversaryInner() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(
    calculateTimeLeft(ANNIVERSARY_CONFIG.eventDate)
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(ANNIVERSARY_CONFIG.eventDate));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 1.1]);

  const config = ANNIVERSARY_CONFIG;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-slate-950 text-slate-100 overflow-hidden"
    >
      {/* ───────────────────────────────────────────────────── */}
      {/* SECTION 1 — HERO: 40주년 비주얼 & D-Day 카운트다운    */}
      {/* ───────────────────────────────────────────────────── */}
      <section className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden">
        {/* 배경 사진 (Parallax) */}
        <motion.div
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="absolute inset-0 z-0"
        >
          <img
            src={config.heroPhotos[0].url}
            alt={config.heroPhotos[0].caption}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/50 to-slate-950" />
        </motion.div>

        {/* 앰비언트 글로우 */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/8 rounded-full blur-[140px] pointer-events-none z-[1]" />

        {/* 콘텐츠 */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 text-center space-y-8 px-6 max-w-4xl"
        >
          {/* 40주년 뱃지 */}
          <div className="inline-flex items-center gap-2 text-amber-300 font-extrabold text-xs uppercase tracking-[0.25em] bg-amber-500/10 border border-amber-500/20 px-5 py-2 rounded-full backdrop-blur-sm">
            <Sparkles className="size-3.5" />
            40th Anniversary · 1986 — 2026
          </div>

          {/* 로고 엠블럼 */}
          <div className="inline-block p-1 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-orange-500 shadow-[0_0_60px_rgba(245,158,11,0.15)]">
            <div className="bg-slate-950 rounded-full p-5">
              <ClubLogo className="size-16 lg:size-20 text-white" />
            </div>
          </div>

          {/* 타이틀 */}
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tighter leading-[1.05]">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-amber-50 to-amber-200/80">
                {config.concertTitle}
              </span>
            </h1>
            <p className="text-sm sm:text-base text-amber-300/80 font-medium tracking-wide">
              {config.concertSubtitle}
            </p>
          </div>

          {/* 구분선 */}
          <div className="h-[2px] w-16 bg-gradient-to-r from-amber-500 to-orange-500 mx-auto" />

          {/* 공식 소개 */}
          <p className="text-slate-400 text-sm font-light">
            {config.clubDescription}
          </p>

          {/* D-Day 카운트다운 */}
          <div className="pt-4">
            <p className="text-xs text-amber-400/60 uppercase tracking-[0.4em] mb-5 font-bold">
              D-Day Countdown
            </p>
            <div className="flex items-center justify-center gap-4 sm:gap-8">
              <CountdownUnit value={timeLeft.days} label="Days" />
              <span className="text-2xl sm:text-4xl font-thin text-amber-500/40 -mt-4">
                :
              </span>
              <CountdownUnit value={timeLeft.hours} label="Hours" />
              <span className="text-2xl sm:text-4xl font-thin text-amber-500/40 -mt-4">
                :
              </span>
              <CountdownUnit value={timeLeft.minutes} label="Min" />
              <span className="text-2xl sm:text-4xl font-thin text-amber-500/40 -mt-4">
                :
              </span>
              <CountdownUnit value={timeLeft.seconds} label="Sec" />
            </div>
          </div>

          {/* CTA 버튼 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-6">
            <a
              href="#attendance"
              className="group inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm px-7 py-3 rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)]"
            >
              참석 신청하기
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="#schedule"
              className="inline-flex items-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-medium text-sm px-7 py-3 rounded-full transition-all duration-300 backdrop-blur-sm"
            >
              <Calendar className="size-4" />
              행사 일정 보기
            </a>
          </div>
        </motion.div>

        {/* 스크롤 유도 아이콘 */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 z-10"
        >
          <ChevronDown className="size-6 text-amber-400/40" />
        </motion.div>
      </section>

      {/* ───────────────────────────────────────────────────── */}
      {/* SECTION 2 — 공연 비주얼 포토 쇼케이스                  */}
      {/* ───────────────────────────────────────────────────── */}
      <section className="relative py-28 sm:py-36 px-6">
        {/* 앰비언트 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[400px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto space-y-16 relative z-10">
          <FadeIn>
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-[0.2em] bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full">
                <Music className="size-3.5" />
                Performance Showcase
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  40년의 열정을 무대에 담다
                </span>
              </h2>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed font-light">
                한양대학교와 한양여자대학교에서 뜨겁게 울려 퍼진 소크나의 사운드.
                40년간 이어진 합주실의 밤과 무대 위의 전율을 사진으로 돌아봅니다.
              </p>
            </div>
          </FadeIn>

          {/* 포토 그리드: Masonry-inspired 레이아웃 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {config.heroPhotos.map((photo, index) => (
              <FadeIn
                key={photo.caption}
                delay={index * 0.1}
                className={cn(
                  "relative group overflow-hidden rounded-2xl sm:rounded-3xl",
                  index === 0 ? "col-span-2 row-span-2 aspect-[4/3]" : "aspect-square"
                )}
              >
                <img
                  src={photo.url}
                  alt={photo.caption}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                  <p className="text-sm font-medium text-white">
                    {photo.caption}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────── */}
      {/* SECTION 3 — 일정 & 타임테이블 & 장소                  */}
      {/* ───────────────────────────────────────────────────── */}
      <section
        id="schedule"
        className="relative py-28 sm:py-36 px-6 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950"
      >
        <div className="max-w-5xl mx-auto space-y-20 relative z-10">
          {/* 헤더 */}
          <FadeIn>
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 text-emerald-400 font-extrabold text-xs uppercase tracking-[0.2em] bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full">
                <Calendar className="size-3.5" />
                Schedule & Venue
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  행사 안내
                </span>
              </h2>
            </div>
          </FadeIn>

          {/* 날짜/장소 카드 */}
          <FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 날짜 카드 */}
              <div className="rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 p-8 space-y-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                    <Clock className="size-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white">일시</h3>
                </div>
                <p className="text-2xl font-black text-white tracking-tight">
                  {config.eventDateDisplay}
                </p>
                <p className="text-sm text-slate-400">
                  접수 시작: 오후 4:30 ~
                </p>
              </div>

              {/* 장소 카드 */}
              <div className="rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 p-8 space-y-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400">
                    <MapPin className="size-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white">장소</h3>
                </div>
                <p className="text-xl font-bold text-white">
                  {config.venue.name}
                </p>
                <p className="text-sm text-slate-400">{config.venue.address}</p>
                <a
                  href={config.venue.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                  네이버 지도에서 보기
                </a>
              </div>
            </div>
          </FadeIn>

          {/* 교통 안내 */}
          <FadeIn>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-4 rounded-2xl bg-slate-800/30 border border-slate-700/30 p-6">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                  <Train className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">대중교통</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {config.venue.subway}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-2xl bg-slate-800/30 border border-slate-700/30 p-6">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                  <Car className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">주차</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {config.venue.parking}
                  </p>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* 타임테이블 */}
          <FadeIn>
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Clock className="size-5 text-amber-400" />
                프로그램 순서
              </h3>
              <div className="space-y-3">
                {config.timetables.map((item, index) => {
                  const style =
                    CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.break;
                  return (
                    <FadeIn key={item.title} delay={index * 0.06}>
                      <div
                        className={cn(
                          "rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 transition-all duration-300 hover:scale-[1.01]",
                          style.bg
                        )}
                      >
                        <div className="flex items-center gap-3 sm:w-48 shrink-0">
                          <span
                            className={cn(
                              "size-2.5 rounded-full shrink-0",
                              style.dot
                            )}
                          />
                          <span
                            className={cn(
                              "text-sm font-bold tabular-nums",
                              style.text
                            )}
                          >
                            {item.time}
                          </span>
                        </div>
                        <div className="flex-1 space-y-1">
                          <h4 className="text-base font-bold text-white">
                            {item.title}
                          </h4>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </FadeIn>
                  );
                })}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────── */}
      {/* SECTION 4 — 40년의 발자취 & 아카이브 갤러리             */}
      {/* ───────────────────────────────────────────────────── */}
      <section className="relative py-28 sm:py-36 px-6">
        {/* 앰비언트 */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[500px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto space-y-16 relative z-10">
          <FadeIn>
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 text-indigo-400 font-extrabold text-xs uppercase tracking-[0.2em] bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full">
                <Camera className="size-3.5" />
                Archive Gallery
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  40년의 발자취
                </span>
              </h2>
              <p className="text-slate-400 text-sm sm:text-base font-light leading-relaxed">
                1986년 창립부터 지금 이 순간까지, 소크나가 걸어온 40년의 시간을
                사진으로 되돌아봅니다.
              </p>
            </div>
          </FadeIn>

          {/* 포토 아카이브 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {config.archivePhotos.map((photo, index) => (
              <FadeIn key={photo.id} delay={index * 0.08}>
                <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl aspect-[4/3] cursor-pointer">
                  <img
                    src={photo.url}
                    alt={photo.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                  />
                  {/* 오버레이 */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                  {/* Era 뱃지 */}
                  <div className="absolute top-4 left-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 bg-white/10 backdrop-blur-sm border border-white/10 px-3 py-1 rounded-full">
                      {photo.era}
                    </span>
                  </div>
                  {/* 콘텐츠 */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 space-y-1.5">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {photo.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300/80 font-light leading-relaxed">
                      {photo.caption}
                    </p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* 역사/갤러리 딥링크 */}
          <FadeIn>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/history"
                className="group inline-flex items-center gap-2 border border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-300 font-medium text-sm px-6 py-3 rounded-full transition-all duration-300"
              >
                <Sparkles className="size-4" />
                동아리 전체 역사 보기
                <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </Link>
              <Link
                href="/photos"
                className="group inline-flex items-center gap-2 border border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-300 font-medium text-sm px-6 py-3 rounded-full transition-all duration-300"
              >
                <Camera className="size-4" />
                사진 갤러리 전체 보기
                <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────── */}
      {/* SECTION 5 — 공연 참석 신청 폼                         */}
      {/* ───────────────────────────────────────────────────── */}
      <section
        id="attendance"
        className="relative py-28 sm:py-36 px-6 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950"
      >
        {/* 앰비언트 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-3xl mx-auto space-y-12 relative z-10">
          <FadeIn>
            <div className="text-center space-y-4 max-w-xl mx-auto">
              <div className="inline-flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-[0.2em] bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full">
                <Sparkles className="size-3.5" />
                Attendance Registration
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  참석 신청
                </span>
              </h2>
              <p className="text-slate-400 text-sm sm:text-base font-light leading-relaxed">
                40주년 기념 공연에 함께해 주실 소크나인 여러분의 참석 여부를
                알려주세요.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <AttendanceForm />
          </FadeIn>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────── */}
      {/* 하단 마감 비주얼                                      */}
      {/* ───────────────────────────────────────────────────── */}
      <section className="relative py-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={config.heroPhotos[2].url}
            alt={config.heroPhotos[2].caption}
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950" />
        </div>
        <FadeIn>
          <div className="relative z-10 space-y-6 max-w-xl mx-auto">
            <div className="inline-block p-1 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-orange-500 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
              <div className="bg-slate-950 rounded-full p-3.5">
                <ClubLogo className="size-10 text-white" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-amber-200/80">
              소리로 크는 나무, 40년의 울림
            </p>
            <p className="text-sm text-slate-500 font-light">
              © 2026 소크나 (SOKNA). All Rights Reserved.
            </p>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
