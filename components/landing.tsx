"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ClubLogo } from "@/components/club-logo";
import { CLUB_NAME_KOREAN } from "@/lib/club";
import { ChevronDown, Sparkles, Music, Camera, Calendar, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const SECTIONS = [
  {
    title: "The Performance",
    subtitle: "합주 / 공연",
    description: "무대 위에서 하나 되는 전율. 우리의 목소리와 사운드가 거친 공기를 뚫고 세상에 닿는 순간.",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2070",
    color: "text-blue-400"
  },
  {
    title: "The Session",
    subtitle: "정기 모임",
    description: "매주 서로의 톤을 맞추고 성장하는 시간. 코드 하나, 비트 하나에 청춘의 밤을 담아냅니다.",
    image: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=2070",
    color: "text-indigo-400"
  },
  {
    title: "The People",
    subtitle: "인연",
    description: "한양대와 한양여대가 만나는 뜨거운 교차점. 음악을 매개로 만나 평생을 나누는 친구가 됩니다.",
    image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=2070",
    color: "text-pink-400"
  },
];

const SNAPS = [
  {
    url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=800",
    tag: "LIVE GIG",
    caption: "35회 정기 정식 콘서트 피날레",
  },
  {
    url: "https://images.unsplash.com/photo-1514525253361-b5508d598351?q=80&w=800",
    tag: "PRACTICE",
    caption: "밤샘 합주, 드럼과 베이스의 합",
  },
  {
    url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=800",
    tag: "CAMPUS FESTIVAL",
    caption: "한양대 애한제 노천극장 야외 공연",
  },
  {
    url: "https://images.unsplash.com/photo-1487180142328-0c4e37023af5?q=80&w=800",
    tag: "SESSION DIARY",
    caption: "건반 세션의 정갈한 클래식 아카이브",
  },
];

export function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  return (
    <div ref={containerRef} className="relative w-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* 백그라운드 앰비언트 글로우 블롭 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/15 via-transparent to-transparent blur-[120px] pointer-events-none z-0" />

      {/* --- HERO SECTION --- */}
      <section className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden">
        {/* 거친 포스터 텍스쳐 */}
        <div className="absolute inset-0 opacity-[0.04] bg-[url('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1000')] bg-cover bg-center pointer-events-none mix-blend-overlay z-10" />
        
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 1.8, 
            ease: [0.22, 1, 0.36, 1],
          }}
          className="z-20 text-center space-y-6 px-4 max-w-4xl"
        >
          {/* 동아리 로고 엠블럼 */}
          <div className="inline-block mb-4 p-1 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
            <div className="bg-slate-950 rounded-full p-4.5">
              <ClubLogo className="size-16 lg:size-20 text-white" />
            </div>
          </div>
          
          <h1 className="text-6xl lg:text-8xl font-black tracking-tighter text-white leading-none relative">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-300">
              {CLUB_NAME_KOREAN}
            </span>
          </h1>
          
          <p className="text-sm lg:text-base font-extrabold text-indigo-400 tracking-[0.4em] uppercase">
            한양대학교 X 한양여자대학교 연합 락 밴드 동아리
          </p>

          <div className="h-[2px] w-12 bg-gradient-to-r from-indigo-500 to-pink-500 mx-auto my-6" />

          <p className="text-slate-400 text-sm lg:text-base max-w-lg mx-auto font-light leading-relaxed">
            무대 조명이 켜지는 순간, 심장 소리를 타고 퍼져나가는 우리의 선율. <br />
            소리로 크는 나무(소크나)에 당신의 주파수를 맞춰보세요.
          </p>
        </motion.div>

        {/* 히어로 배경 이미지 - 멋진 콘서트 장소 */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070" 
            alt="SOKNA HERO"
            className="w-full h-full object-cover opacity-35 filter brightness-75 contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/40 to-slate-950" />
        </div>
        
        {/* 아래로 스크롤 안내 */}
        <motion.div 
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="absolute bottom-10 z-20 flex flex-col items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-widest cursor-pointer"
          onClick={() => {
            window.scrollTo({
              top: window.innerHeight,
              behavior: "smooth"
            });
          }}
        >
          <span>Scroll Down</span>
          <ChevronDown className="size-5" />
        </motion.div>
      </section>

      {/* --- 40주년 기념 배너 CTA --- */}
      <section className="relative z-10 px-6 py-6">
        <div
          onClick={() => router.push("/40th-anniversary")}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              router.push("/40th-anniversary");
            }
          }}
          className="max-w-5xl mx-auto rounded-2xl sm:rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/20 p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/[0.07] transition-all duration-300 group backdrop-blur-sm"
        >
          <div className="shrink-0 p-3 rounded-2xl bg-amber-500/10">
            <Sparkles className="size-6 text-amber-400" />
          </div>
          <div className="flex-1 text-center sm:text-left space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-amber-400">
              40th Anniversary · 1986 — 2026
            </p>
            <p className="text-lg sm:text-xl font-black text-white tracking-tight">
              소리로 크는 나무 40주년 기념 공연
            </p>
            <p className="text-sm text-slate-400 font-light">
              40년의 울림을 함께할 소크나인의 참석을 기다립니다
            </p>
          </div>
          <div className="shrink-0 inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-sm px-5 py-2.5 rounded-full group-hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-shadow">
            <span className="text-base leading-none">🎂</span>
            <span>40주년 행사 바로가기</span>
            <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </section>

      {/* --- LIVE MEMORIES: 활동 사진 스냅샷 강조 섹션 --- */}
      <section className="py-24 px-6 relative z-10 border-t border-white/5 bg-slate-950/50 backdrop-blur-md">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <span className="text-xs font-black uppercase text-indigo-400 tracking-[0.25em] flex items-center gap-2">
                <Camera className="size-4" /> Live Memories
              </span>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-none text-white">
                활동 사진첩
              </h2>
            </div>
            <p className="text-sm text-slate-400 max-w-md font-light leading-relaxed">
              연습실 구석에서 맞춰보는 작은 코드 진행부터, 노천극장을 가득 채우는 폭발적인 메인 정기 공연까지의 찬란한 순간들입니다.
            </p>
          </div>

          {/* 사진 갤러리 그리드 - 폴라로이드/포스터 혼합 느낌 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {SNAPS.map((snap, index) => (
              <motion.div
                key={snap.caption}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="group relative bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
              >
                {/* 이미지 박스 */}
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-950 relative border-b border-white/5">
                  <img
                    src={snap.url}
                    alt={snap.caption}
                    className="w-full h-full object-cover filter grayscale contrast-110 group-hover:grayscale-0 group-hover:scale-105 transition-all duration-750 ease-out"
                  />
                  <div className="absolute top-3 left-3 bg-indigo-600/90 text-white font-black text-[9px] tracking-wider px-2 py-0.5 rounded border border-white/10 uppercase shadow-sm">
                    {snap.tag}
                  </div>
                </div>
                {/* 정보 */}
                <div className="p-4 space-y-1 text-left">
                  <p className="text-xs text-slate-400 font-medium tracking-tight">
                    {snap.caption}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- SCROLL SECTIONS: 패럴랙스 슬라이드 --- */}
      {SECTIONS.map((section, idx) => (
        <ScrollSection key={idx} section={section} />
      ))}

      {/* --- BOTTOM TICKET CTA / INFO: 공연 티켓 형태 개선 --- */}
      <section className="py-32 px-6 bg-slate-950 relative">
        {/* 하단 글로우 블롭 */}
        <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-pink-900/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto grid md:grid-cols-12 gap-12 items-center">
          <div className="md:col-span-5 space-y-6 text-left">
            <h2 className="text-5xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white">
              SOUND OF <br />
              <span className="text-slate-500 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-pink-500">CONNECTION</span>
            </h2>
            <p className="text-lg text-slate-400 font-light leading-relaxed">
              서로 다른 악기와 소리가 모여 마침내 하나가 되듯, 소크나와 함께할 당신의 소리를 환영합니다.
            </p>
          </div>
          
          {/* 콘서트 티켓 풍 CTA 카드 디자인 */}
          <div className="md:col-span-7 w-full max-w-xl mx-auto">
            <div className="relative bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/20 rounded-[2rem] p-8 sm:p-10 shadow-2xl backdrop-blur-md overflow-hidden group">
              {/* 위아래 티켓 홈 반원 (티켓 스타일 연출) */}
              <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950 border-r border-indigo-500/20" />
              <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950 border-l border-indigo-500/20" />
              
              {/* 은은한 네온 스트립 */}
              <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

              <div className="relative space-y-6 text-left pl-2">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-widest">
                  <Calendar className="size-4" /> Live Gig Pass
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">선곡 회의 및 공연 예매</h3>
                  <p className="text-sm text-slate-400 leading-relaxed font-light">
                    준비 중인 차기 정기 공연과 선곡 회의 일정을 지금 실시간으로 확인하고 참여해보세요.
                  </p>
                </div>

                {/* 가상 바코드 */}
                <div className="flex flex-col gap-1 opacity-20 pt-4 border-t border-white/5">
                  <div className="h-6 bg-gradient-to-r from-slate-100 via-transparent to-slate-100 bg-[repeat:4px_100%] bg-size-[8px_100%] w-full" 
                    style={{ backgroundImage: "linear-gradient(90deg, #fff 50%, transparent 50%)", backgroundSize: "6px 100%" }}
                  />
                  <span className="text-[9px] tracking-[0.4em] text-slate-300 font-mono text-center">SOKNA-LIVEPASS-2026</span>
                </div>

                <button 
                  onClick={() => router.push("/gigs")}
                  className="w-full flex items-center justify-center gap-2 px-8 py-4.5 bg-white text-slate-950 rounded-2xl font-black text-base hover:bg-gradient-to-r hover:from-indigo-400 hover:to-pink-500 hover:text-white hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all duration-300"
                >
                  공연 일정 바로가기
                  <ArrowRight className="size-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScrollSection({ section }: { section: typeof SECTIONS[0] }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  const scale = useTransform(scrollYProgress, [0, 1], [1.05, 1.2]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0, 1, 1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [80, 0, 0, -80]);

  return (
    <section ref={ref} className="relative h-[180vh] w-full">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
        
        {/* 백그라운드 이미지 감싸는 div */}
        <motion.div 
          style={{ scale }} 
          className="absolute inset-0 w-full h-full z-0"
        >
          <img 
            src={section.image} 
            alt={section.title}
            className="w-full h-full object-cover object-center filter brightness-[0.5] contrast-[1.1]"
          />
          {/* 암부 보정 오버레이 */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/30 to-slate-950" />
        </motion.div>

        {/* 텍스트 내용 */}
        <motion.div 
          style={{ opacity: textOpacity, y: textY }}
          className="relative z-10 text-center px-4 max-w-3xl space-y-6"
        >
          <span className={cn("text-xs font-black tracking-[0.4em] uppercase bg-white/5 border border-white/10 px-4 py-1.5 rounded-full inline-block", section.color)}>
            {section.subtitle}
          </span>
          <h2 className="text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-none">
            {section.title}
          </h2>
          <p className="text-base lg:text-xl text-slate-300 font-light leading-relaxed max-w-2xl mx-auto">
            {section.description}
          </p>
        </motion.div>
      </div>
    </section>
  );
}