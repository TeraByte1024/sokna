"use client";

import { motion } from "framer-motion";
import {
  History,
  Music,
  Award,
  Radio,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const MILESTONES = [
  {
    year: "1986년",
    title: "소리로 크는 나무 창립",
    subtitle: "동아리의 태동",
    desc: "한양대학교와 한양여자대학교의 연합 밴드 동아리 '소리로 크는 나무'가 첫 연주를 세상에 울리며 공식 창립되었습니다.",
    icon: Sparkles,
    color: "from-blue-600 to-indigo-600",
    image: "https://images.unsplash.com/photo-1514525253361-b5508d598351?q=80&w=600",
  },
  {
    year: "2026년",
    title: "스마트 플랫폼 도입",
    subtitle: "디지털 밴드 시스템",
    desc: "실시간 선곡 관리, 스마트 세션 매핑, 역사 보관 등을 아우르는 전용 디지털 웹 시스템을 구축해 동아리 소통과 협업을 극대화했습니다.",
    icon: Award,
    color: "from-rose-600 to-red-600",
    image: "https://images.unsplash.com/photo-1485579149621-3123dd979885?q=80&w=600",
  },
];

export function HistoryInner() {
  return (
    <div className="space-y-24 w-full">
      {/* 1. 인트로 영웅 영역 */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 text-white min-h-[400px] flex items-center p-8 sm:p-16 border border-white/5 shadow-2xl">
        {/* 우아한 백그라운드 오로라 글로우 블롭 */}
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[350px] h-[350px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-[250px] h-[250px] bg-pink-600/10 rounded-full blur-[90px] pointer-events-none" />

        {/* 거친 라이브 백그라운드 텍스쳐 */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/60 via-slate-950 to-slate-950 z-0" />
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000')] bg-cover bg-center pointer-events-none mix-blend-overlay" />

        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 text-indigo-400 font-extrabold text-xs uppercase tracking-[0.2em] bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full">
            <Sparkles className="size-3.5" /> Established in 1993
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.1] text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-slate-400">
            SOKNA <br />
            HISTORY & snaps
          </h1>
          <p className="text-base sm:text-lg text-slate-300 font-light leading-relaxed max-w-2xl">
            <strong>소리로 크는 나무(소크나)</strong>는 한양대학교와 한양여자대학교의 연합 밴드 동아리입니다.
            진득한 연습실 냄새와 화려한 앰프의 열기, 우리만의 호흡과 관객의 환호성으로 채워온 30여 년의 시간을 돌아봅니다.
          </p>
        </div>
      </section>

      {/* 2. 연혁 섹션 */}
      <section className="space-y-12">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <History className="size-7 text-indigo-500" />
            시간의 기록
          </h2>
          <p className="text-sm text-muted-foreground">
            소크나가 뿌리를 내려 울창한 소리의 숲을 이루기까지의 역사적 발자취입니다.
          </p>
        </div>

        {/* 연혁 타임라인 리스트 */}
        <div className="grid grid-cols-1 gap-12 relative pl-8 border-l border-slate-200 dark:border-zinc-800 ml-4 md:ml-6">
          {MILESTONES.map((m, index) => {
            const Icon = m.icon;
            return (
              <motion.div
                key={m.year}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.05 }}
                className="relative"
              >
                {/* 타임라인 원형 노드 */}
                <span className="absolute -left-[3.25rem] top-1.5 flex items-center justify-center size-9 md:size-11 rounded-full bg-background border border-slate-200 dark:border-zinc-800 shadow-md">
                  <span className={`p-1.5 rounded-full bg-gradient-to-tr ${m.color} text-white`}>
                    <Icon className="size-4" />
                  </span>
                </span>

                {/* 마일스톤 카드 레이아웃 */}
                <Card className="border border-slate-100 dark:border-zinc-800/80 shadow-md bg-gradient-to-br from-white to-slate-50/50 dark:from-zinc-900/50 dark:to-zinc-950/20 overflow-hidden rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-start hover:shadow-lg transition-all duration-300">
                  {/* 카드 내용 */}
                  <div className="flex-1 space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider text-indigo-500 bg-indigo-500/10 px-3 py-1 rounded-full">
                        {m.year}
                      </span>
                      <h3 className="text-2xl font-black text-foreground pt-1 flex items-center gap-2">
                        {m.title}
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                        {m.subtitle}
                      </p>
                    </div>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                      {m.desc}
                    </p>
                  </div>
                  {/* 미니 스냅샷 이미지 */}
                  <div className="w-full md:w-48 h-32 md:h-full aspect-[4/3] rounded-2xl overflow-hidden relative shadow-sm shrink-0 border border-slate-200/50 dark:border-zinc-800">
                    <img
                      src={m.image}
                      alt={m.title}
                      className="w-full h-full object-cover filter grayscale hover:grayscale-0 transition-all duration-500"
                    />
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
