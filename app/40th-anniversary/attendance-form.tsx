"use client";

import { ExternalLink, MessageCircle, Mail, Phone, CheckCircle, Info } from "lucide-react";
import { ANNIVERSARY_CONFIG } from "@/lib/anniversary";

export function AttendanceForm() {
  const rsvp = ANNIVERSARY_CONFIG.rsvp;
  const contact = ANNIVERSARY_CONFIG.contact;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-slate-800/60 via-slate-900/60 to-slate-950/80 border border-amber-500/20 p-6 sm:p-10 space-y-8 backdrop-blur-md shadow-2xl shadow-black/40">
      {/* 안내 헤더 */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-[0.2em] bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full">
          <Info className="size-3.5" />
          {rsvp.badge}
        </div>
        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {rsvp.title}
        </h3>
        <p className="text-sm sm:text-base text-slate-300 font-light leading-relaxed max-w-xl mx-auto">
          {rsvp.description}
        </p>
      </div>

      {/* 구글 폼 이동 CTA 버튼 */}
      <div className="flex flex-col items-center justify-center pt-2 space-y-3">
        <a
          href={rsvp.googleFormUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-base sm:text-lg px-8 py-4 rounded-2xl transition-all duration-300 shadow-[0_0_30px_rgba(245,158,11,0.25)] hover:shadow-[0_0_40px_rgba(245,158,11,0.45)] hover:scale-[1.02] cursor-pointer"
        >
          <span>{rsvp.buttonText}</span>
          <ExternalLink className="size-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </a>
        <p className="text-xs text-amber-300/70 font-medium">
          {rsvp.subText}
        </p>
      </div>

      {/* 참석 유의사항 및 안내 리스트 */}
      <div className="rounded-2xl bg-slate-950/60 border border-slate-800/80 p-5 sm:p-6 space-y-3">
        <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
          <CheckCircle className="size-4" />
          {rsvp.noticeTitle}
        </h4>
        <ul className="space-y-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
          {rsvp.notices.map((notice, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-amber-500/70 font-mono mt-0.5">•</span>
              <span>{notice}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 문의처 빠른 링크 */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <span>{rsvp.contactInquiryText}</span>
        <div className="flex items-center gap-4">
          {contact.kakaoOpenChat && (
            <a
              href={contact.kakaoOpenChat}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors"
            >
              <MessageCircle className="size-3.5" />
              <span>오픈채팅</span>
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
            >
              <Mail className="size-3.5" />
              <span>{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
            >
              <Phone className="size-3.5" />
              <span>{contact.phone}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
