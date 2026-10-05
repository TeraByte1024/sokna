"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, MessageSquare, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EligibleSession, Nomination, RecommendedVocal } from "@/lib/nomination";
import { PositiveStatusIcon, NegativeStatusIcon, UnknownStatusIcon } from "@/components/ui/status-icons";

export type SongResponseEntry = EligibleSession & { performer: RecommendedVocal };

export function SongResponseDetailsDialog({ song, entries, onClose, onOpenSong }: {
  song: Nomination;
  entries: SongResponseEntry[];
  onClose: () => void;
  onOpenSong: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onClose={onClose} aria-labelledby="song-response-details-title" className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-3xl border border-border/80 bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60">
    <div className="flex max-h-[min(85dvh,calc(100dvh-2rem))] flex-col">
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 bg-muted/40 px-6 py-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="size-4.5" /></div>
        <div className="min-w-0">
          <h2 id="song-response-details-title" className="text-sm font-black tracking-tight">곡 응답 현황</h2>
          <p className="mt-1 break-words text-xs font-semibold text-muted-foreground [overflow-wrap:anywhere]">{song.title || "제목 없음"}{song.artist && <span className="font-normal"> · {song.artist}</span>}</p>
        </div>
      </div>
      <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 rounded-full hover:bg-muted" aria-label="응답 상세 닫기" onClick={onClose}><X className="size-4" /></Button>
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
      {entries.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">해당 세션 없음</p> : entries.map(({ performer, sessionPart, existingResponse }) => <div key={`${performer.id}:${sessionPart}`} className="flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-border/80 bg-card p-3 text-xs sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="outline" className={`h-6 shrink-0 gap-1 rounded-lg px-2 text-[11px] font-bold ${existingResponse?.status === "available" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : existingResponse?.status === "unavailable" ? "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-400" : "border-border bg-muted text-muted-foreground"}`}>
          {performer.userId && (existingResponse?.status === "available" ? <PositiveStatusIcon className="size-3" /> : existingResponse?.status === "unavailable" ? <NegativeStatusIcon className="size-3" /> : <UnknownStatusIcon className="size-3" />)}
          {!performer.userId ? "계정 미연결" : existingResponse?.status === "available" ? "가능" : existingResponse?.status === "unavailable" ? "불가능" : "미응답"}
        </Badge>
        <p className="min-w-0 break-words text-sm font-bold [overflow-wrap:anywhere]">{performer.generation != null ? `${performer.generation}기 ` : ""}{performer.name}</p>
        <span className="rounded-md border border-border/60 bg-muted/80 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground [overflow-wrap:anywhere]">{sessionPart}</span>
        </div>
        {existingResponse?.comment?.trim() && <div className="flex min-w-0 max-w-full items-start gap-1.5 rounded-xl border border-border/60 bg-muted/60 px-3 py-1.5 text-xs sm:max-w-[50%] sm:shrink-0">
          <MessageSquare className="mt-0.5 size-3 shrink-0 text-primary opacity-80" />
          <p className="min-w-0 whitespace-pre-wrap break-words font-medium [overflow-wrap:anywhere]">{existingResponse.comment.trim()}</p>
        </div>}
      </div>)}
    </div>
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/70 bg-muted/30 px-6 py-3">
      <Button type="button" variant="outline" size="sm" className="h-8 px-4 text-xs font-bold" onClick={onClose}>닫기</Button>
      <Button type="button" size="sm" className="h-8 px-4 text-xs font-bold" onClick={onOpenSong}>곡 상세 열기 <ArrowRight className="size-3" /></Button>
    </div>
    </div>
  </dialog>;
}
