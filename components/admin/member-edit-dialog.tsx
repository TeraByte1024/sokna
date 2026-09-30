"use client";

import { useEffect, useState } from "react";
import { updateMemberByAdminAction, type AdminMember } from "@/app/admin/members/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [part, setPart] = useState(member.part ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isDirty =
    name.trim() !== member.name.trim() ||
    generation.trim() !== String(member.generation ?? "") ||
    part.trim() !== (member.part ?? "").trim();
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
      part.trim() || null,
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    markSubmitting();
    toast.success("회원 정보를 수정했습니다.");
    onSaved({ ...member, name: nextName, generation: nextGeneration, part: part.trim() || null });
    onClose();
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-edit-member-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) close(); }}
      >
        <div className="w-full max-w-lg space-y-5 rounded-xl border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div>
            <h2 id="admin-edit-member-title" className="text-lg font-bold">회원 정보 수정</h2>
            <p className="text-sm text-muted-foreground">{member.email || "이메일 없음"}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>이름</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} disabled={saving} autoFocus />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>기수</span>
              <Input type="number" min={1} value={generation} onChange={(event) => setGeneration(event.target.value)} disabled={saving} />
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium">
            <span>세션 (선택)</span>
            <Input list="admin-member-sessions" value={part} onChange={(event) => setPart(event.target.value)} disabled={saving} />
            <datalist id="admin-member-sessions">
              {["보컬", "보컬(남)", "보컬(여)", "기타", "베이스", "드럼", "건반", "창작"].map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
            <Button type="button" variant="outline" onClick={close} disabled={saving}>취소</Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
          </div>
        </div>
      </div>
      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
        title="수정을 중단하시겠습니까?"
        description="작성 중인 회원 정보가 저장되지 않았습니다."
      />
    </>
  );
}
