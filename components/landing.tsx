"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ClubLogo } from "@/components/club-logo";
import { CLUB_NAME_KOREAN } from "@/lib/club";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    title: "The Performance",
    subtitle: "합주 / 공연",
    description: "무대 위에서 하나 되는 전율, 우리의 목소리가 세상에 닿는 순간.",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=2070",
    color: "text-blue-500"
  },
  {
    title: "The Session",
    subtitle: "정기 모임",
    description: "매주 함께 고민하고 성장하는 시간. 음악 그 이상의 가치를 공유합니다.",
    image: "https://images.unsplash.com/photo-1514525253361-b5508d598351?q=80&w=1974",
    color: "text-emerald-500"
  },
  {
    title: "The People",
    subtitle: "친목",
    description: "한양대와 한양여대가 만나는 접점. 평생 함께할 인연을 쌓아갑니다.",
    image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=2070",
    color: "text-rose-500"
  },
];

export function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative w-full bg-black">
      {/* --- HERO SECTION --- */}
      <section className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 1.5, 
            ease: [0.22, 1, 0.36, 1],
          }}
          className="z-20 text-center space-y-4 px-4"
        >
          <div className="inline-block mb-6 p-1 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500">
            <div className="bg-black rounded-full p-4">
              <ClubLogo className="size-16 lg:size-24 text-white" />
            </div>
          </div>
          
          {/* ✅ 메인 타이틀: font-semibold로 굵기 상향, 양식 통일 (직립) */}
          <h1 className="text-5xl lg:text-7xl font-semibold tracking-tight text-white leading-none">
            {CLUB_NAME_KOREAN}
          </h1>
          
          <p className="text-lg lg:text-2xl font-light text-slate-400 tracking-[0.3em] uppercase">
            한양대학교 X 한양여자대학교 연합 밴드 동아리
          </p>
        </motion.div>

        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070" 
            alt="SOKNA"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
        </div>
        
        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-12 z-20 text-white/30"
        >
          <ChevronDown className="size-10" />
        </motion.div>
      </section>

      {/* --- SCROLL SECTIONS --- */}
      {SECTIONS.map((section, idx) => (
        <ScrollSection key={idx} section={section} />
      ))}

      {/* --- BOTTOM CTA / INFO --- */}
      <section className="py-32 px-6 bg-white text-black">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            {/* ✅ 하단 타이틀도 font-bold/semibold 계열로 통일 */}
            <h2 className="text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              SOUND OF <br />
              <span className="text-slate-400">CONNECTION</span>
            </h2>
            <p className="text-xl text-slate-600 leading-relaxed font-light">
              하나의 뿌리, 각자의 소리로
            </p>
          </div>
          
          <div className="relative group p-10 bg-slate-50 rounded-[2rem] border border-slate-100 overflow-hidden shadow-2xl shadow-blue-500/10">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <ClubLogo className="size-40" />
            </div>
            <h3 className="text-2xl font-bold mb-4 tracking-tight">선곡 회의 안내</h3>
            <p className="text-slate-500 mb-8 leading-relaxed">
              소크나가 준비 중인 공연을 지금 확인해보세요.
            </p>
            <button className="px-8 py-4 bg-black text-white rounded-full font-bold hover:bg-blue-600 transition-colors">
              공연 정보 확인하기
            </button>
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

  // 스케일 효과가 일어날 때 여백이 보이지 않도록 기본 시작 값을 1.1 정도로 주면 더 안전합니다.
  const scale = useTransform(scrollYProgress, [0, 1], [1.1, 1.3]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0, 1, 1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [100, 0, 0, -100]);

  return (
    <section ref={ref} className="relative h-[200vh] w-full">
      {/* sticky 컨테이너가 w-full인지 다시 한번 확인합니다 */}
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
        
        {/* ✅ 이미지 감싸는 div: absolute inset-0으로 부모(sticky div)를 완전히 덮도록 설정 */}
        <motion.div 
          style={{ scale }} 
          className="absolute inset-0 w-full h-full z-0"
        >
          <img 
            src={section.image} 
            alt={section.title}
            // ✅ object-cover를 통해 이미지 비율을 유지하며 영역을 꽉 채움
            className="w-full h-full object-cover object-center"
          />
          {/* 오버레이가 이미지 위에 정확히 겹치도록 설정 */}
          <div className="absolute inset-0 bg-black/70" />
        </motion.div>

        <motion.div 
          style={{ opacity: textOpacity, y: textY }}
          className="relative z-10 text-center px-4 max-w-4xl"
        >
          <span className={cn("text-lg lg:text-xl font-bold tracking-[0.5em] uppercase mb-4 block", section.color)}>
            {section.subtitle}
          </span>
          <h2 className="text-6xl lg:text-8xl font-semibold text-white uppercase tracking-tighter mb-8 leading-none">
            {section.title}
          </h2>
          <p className="text-xl lg:text-3xl text-slate-300 font-light leading-snug">
            {section.description}
          </p>
        </motion.div>
      </div>
    </section>
  );
}