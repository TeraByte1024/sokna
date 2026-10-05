"use client";

import { useEffect, useRef } from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecommendedVocal } from "@/lib/nomination";

export function ResponsePerformerLegendDialog({ sessionPart, performers, onClose }: {
  sessionPart: string;
  performers: RecommendedVocal[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onClose={onClose} aria-labelledby="response-performer-legend-title" className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-3xl border border-border/80 bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60">
    <div className="flex max-h-[min(85dvh,calc(100dvh-2rem))] flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-muted/40 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Info className="size-4.5" /></div>
          <div className="min-w-0">
            <h2 id="response-performer-legend-title" className="text-sm font-black">응답 현황 공연자 순서</h2>
            <p className="break-words text-xs font-semibold text-muted-foreground">{sessionPart} · {performers.length}명</p>
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 rounded-full" aria-label="번호 안내 닫기" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">선택한 공연자만 목록 순서대로 1번부터 번호를 부여합니다. 왼쪽부터 한 줄에 5명씩 표시됩니다.</p>
        <ol className="space-y-1.5">
          {performers.map((item, index) => <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3">
            <span className="flex h-6 min-w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/80 px-1 text-xs font-bold">{index + 1}</span>
            <span className="min-w-0 break-words text-sm font-bold [overflow-wrap:anywhere]">{item.generation != null ? `${item.generation}기 ` : ""}{item.name}</span>
            {!item.userId && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">계정 미연결</span>}
          </li>)}
        </ol>
        {performers.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">해당 세션의 공연자가 없습니다.</p>}
      </div>
      <div className="flex shrink-0 justify-end border-t border-border/70 bg-muted/30 px-6 py-3"><Button type="button" variant="outline" size="sm" className="h-8 px-4 text-xs font-bold" onClick={onClose}>닫기</Button></div>
    </div>
  </dialog>;
}
