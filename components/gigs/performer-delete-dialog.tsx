"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function PerformerDeleteDialog({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby="performer-delete-title" onClose={onClose} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl backdrop:bg-black/60">
    <h2 id="performer-delete-title" className="font-semibold">공연자를 삭제하시겠습니까?</h2>
    <p className="mt-3 text-sm text-muted-foreground">{name}님을 공연 참여자 명단에서 제외합니다. 공연의 ‘수정 완료’를 눌러야 최종 저장됩니다.</p>
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onClose}>취소</Button>
      <Button type="button" variant="destructive" onClick={onConfirm}>삭제</Button>
    </div>
  </dialog>;
}
