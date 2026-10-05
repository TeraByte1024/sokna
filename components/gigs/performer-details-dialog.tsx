"use client";

import { useEffect, useRef, useState } from "react";
import { X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isPerformerLinked, type Performer } from "@/components/performer-selector";

export function PerformerDetailsDialog({ performer, note, notesLoadError, onClose, onSave, onLink, onDelete }: {
  performer: Performer;
  note?: string;
  notesLoadError?: boolean;
  onClose: () => void;
  onSave: (part: string) => void;
  onLink: (part: string) => void;
  onDelete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [part, setPart] = useState(performer.part || "");
  const normalizedPart = Array.from(new Set(part.split(",").map((value) => value.trim()).filter(Boolean))).join(", ");
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  return <dialog ref={dialogRef} aria-labelledby="performer-details-title" onClose={onClose} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl backdrop:bg-black/60">
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 id="performer-details-title" className="font-semibold">공연 참여자 상세</h2>
      <Button type="button" size="icon" variant="ghost" aria-label="상세 닫기" onClick={onClose}><X className="size-4" /></Button>
    </div>
    <dl className="mb-5 grid grid-cols-[4rem_1fr] gap-3 text-sm">
      <dt className="text-muted-foreground">이름</dt><dd className="font-semibold">{performer.name}</dd>
      <dt className="text-muted-foreground">기수</dt><dd>{performer.generation != null ? `${performer.generation}기` : "-"}</dd>
      <dt className="text-muted-foreground">계정</dt><dd className="break-all">{isPerformerLinked(performer) ? performer.email || "연동됨" : "미연동"}</dd>
    </dl>
    <label htmlFor="performer-detail-parts" className="text-sm font-medium">담당 세션</label>
    <Input id="performer-detail-parts" value={part} onChange={(event) => setPart(event.target.value)} className="mt-2" placeholder="예: 기타, 건반" />
    <p className="mt-2 text-xs text-muted-foreground">여러 세션은 쉼표로 구분합니다. 변경사항은 공연의 ‘수정 완료’를 눌러 최종 저장합니다.</p>
    <div className="mt-5 space-y-2">
      <p className="text-sm font-medium">비고</p>
      {notesLoadError ? <p className="text-sm text-destructive">비고를 불러오지 못했습니다.</p> : note?.trim() ? <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/60 p-3 text-sm"><MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" /><p className="whitespace-pre-wrap break-words">{note.trim()}</p></div> : <p className="text-sm text-muted-foreground">-</p>}
    </div>
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Button type="button" variant="destructive" onClick={onDelete}>공연자 삭제</Button>
      {!isPerformerLinked(performer) && <Button type="button" variant="outline" onClick={() => onLink(normalizedPart)}>계정 연동</Button>}
      <Button type="button" className="ml-auto" onClick={() => onSave(normalizedPart)}>적용</Button>
    </div>
  </dialog>;
}
