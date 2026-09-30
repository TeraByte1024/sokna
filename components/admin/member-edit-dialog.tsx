"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { updateMemberByAdminAction, type AdminMember } from "@/app/admin/members/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberSessionField, SESSION_PRESETS } from "@/components/member-session-field";
import { X } from "lucide-react";
import { LeaveConfirmDialog, useUnsavedChangesWarning } from "@/components/ui/leave-confirm-dialog";
import { toast } from "@/components/ui/sonner";

export function MemberEditDialog({
  member,
  onClose,
  onSaved,
}: {
  member: AdminMember;
  onClose: () => void;
  onSaved: (updated: AdminMember) => void;
}) {
  const [name, setName] = useState(member.name);
  const [generation, setGeneration] = useState(String(member.generation ?? ""));
  const [selectedPreset, setSelectedPreset] = useState(member.part ? SESSION_PRESETS.includes(member.part as typeof SESSION_PRESETS[number]) ? member.part : "직접 입력" : "");
  const [customPart, setCustomPart] = useState(member.part && !SESSION_PRESETS.includes(member.part as typeof SESSION_PRESETS[number]) ? member.part : "");
  const part = selectedPreset === "직접 입력" ? customPart.trim() : selectedPreset;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isDirty =
    name.trim() !== member.name.trim() ||
    generation.trim() !== String(member.generation ?? "") ||
    part !== (member.part ?? "").trim();
  const { showLeaveModal, cancelLeave, confirmLeave, triggerConfirm, markSubmitting } =
    useUnsavedChangesWarning({ isDirty });
  const close = () => triggerConfirm(onClose);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const save = async () => {
    const nextName = name.trim();
    const nextGeneration = Number(generation);
    if (!nextName || !Number.isSafeInteger(nextGeneration) || nextGeneration < 1) {
      setError("이름과 1 이상의 기수를 확인해 주세요.");
      return;
    }
    setSaving(true);
    const result = await updateMemberByAdminAction(
      member.id,
      nextName,
      nextGeneration,
      part || null,
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    markSubmitting();
    toast.success("회원 정보를 수정했습니다.");
    onSaved({ ...member, name: nextName, generation: nextGeneration, part: part || null });
    onClose();
  };

  return (
    <>
      {createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-edit-member-title"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) close(); }}
        >
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 id="admin-edit-member-title" className="text-lg font-bold">회원 정보 수정</h2>
                <p className="text-xs text-muted-foreground">이름, 기수, 담당 세션을 수정합니다.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="닫기" onClick={close} disabled={saving}><X className="size-4" /></Button>
            </div>
            <div className="space-y-5">
              <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground break-all">
                <span className="font-semibold text-foreground">계정 이메일:</span> {member.email || "이메일 없음"}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="admin-member-name" className="flex items-center gap-1 text-xs font-semibold">이름 (실명) <span className="text-destructive">*</span></Label>
                  <Input id="admin-member-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 홍길동" disabled={saving} className="h-10" autoFocus />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="admin-member-generation" className="flex items-center gap-1 text-xs font-semibold">기수 <span className="text-destructive">*</span></Label>
                  <div className="flex items-center gap-2">
                    <Input id="admin-member-generation" type="number" min={1} value={generation} onChange={(event) => setGeneration(event.target.value)} placeholder="예: 40" disabled={saving} className="h-10 min-w-0" />
                    <span className="shrink-0 text-sm font-medium text-muted-foreground">기</span>
                  </div>
                </div>
              </div>
              <MemberSessionField selectedPreset={selectedPreset} customPart={customPart}
                onPresetChange={(value) => setSelectedPreset((current) => current === value ? "" : value)}
                onCustomPartChange={setCustomPart} required={false} disabled={saving} />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
                <Button type="button" variant="outline" onClick={close} disabled={saving}>취소</Button>
                <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {showLeaveModal && createPortal(<LeaveConfirmDialog
        isOpen={showLeaveModal}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
        title="수정을 중단하시겠습니까?"
        description="작성 중인 회원 정보가 저장되지 않았습니다."
      />, document.body)}
    </>
  );
}
