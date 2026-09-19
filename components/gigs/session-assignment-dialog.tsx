"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Performer } from "@/components/performer-selector";
import {
  Layers,
  Search,
  Check,
  X,
  User,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SessionAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  performers: Performer[];
  onConfirmAssign: (sessionName: string, targetIndices: number[]) => void;
}

// 기본 추천 세션 프리셋 (코러스 제외)
const PRESET_SESSIONS = ["보컬", "기타", "베이스", "드럼", "건반"];

export function SessionAssignmentDialog({
  isOpen,
  onClose,
  performers,
  onConfirmAssign,
}: SessionAssignmentDialogProps) {
  const [sessionName, setSessionName] = useState("");
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [performerSearch, setPerformerSearch] = useState("");

  // 모달 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setSessionName("");
      setSelectedIndices([]);
      setPerformerSearch("");
    }
  }, [isOpen]);

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 검색어로 필터링된 공연자 목록 (원래 인덱스 유지)
  const filteredPerformers = performers
    .map((p, idx) => ({ performer: p, originalIndex: idx }))
    .filter(({ performer }) => {
      if (!performerSearch.trim()) return true;
      const q = performerSearch.trim().toLowerCase();
      const nameMatch = performer.name.toLowerCase().includes(q);
      const genMatch = performer.generation?.toString().includes(q);
      const partMatch = (performer.part || "").toLowerCase().includes(q);
      return nameMatch || genMatch || partMatch;
    });

  const handleToggleIndex = (idx: number) => {
    setSelectedIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredOriginalIndices = filteredPerformers.map((fp) => fp.originalIndex);
    const isAllSelected = filteredOriginalIndices.every((i) =>
      selectedIndices.includes(i)
    );

    if (isAllSelected) {
      // 필터링된 인원 해제
      setSelectedIndices((prev) =>
        prev.filter((i) => !filteredOriginalIndices.includes(i))
      );
    } else {
      // 필터링된 인원 추가
      setSelectedIndices((prev) =>
        Array.from(new Set([...prev, ...filteredOriginalIndices]))
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sessionName.trim();
    if (!trimmed) {
      toast.error("세션명을 입력하거나 프리셋을 선택해주세요.");
      return;
    }
    if (selectedIndices.length === 0) {
      toast.error("세션을 할당할 공연자를 1명 이상 선택해주세요.");
      return;
    }

    onConfirmAssign(trimmed, selectedIndices);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg bg-card border border-border/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/70 bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Layers className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-foreground">
                세션 추가 및 인원 할당
              </h3>
              <p className="text-[11px] text-muted-foreground">
                세션을 선택하고 담당할 공연자를 일괄 지정합니다.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full size-8 hover:bg-muted"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* 모달 폼 본문 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* 1. 세션명 입력 및 프리셋 선택 */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground">
              세션명 *
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {PRESET_SESSIONS.map((preset) => {
                const isSelected = sessionName.trim() === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSessionName(preset)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground border-border/70 hover:bg-muted"
                    )}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Input
                placeholder="세션명 직접 입력 (예: 첼로, 색소폰, 일렉기타, 어쿠스틱기타)"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="text-xs h-9 bg-background"
                required
              />
            </div>
          </div>

          {/* 2. 할당 대상 공연자 Multi-Select */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-foreground">
                  할당할 공연자 선택 *
                </label>
                <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  {selectedIndices.length}명 선택됨
                </span>
              </div>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-[11px] text-muted-foreground hover:text-foreground font-semibold cursor-pointer underline underline-offset-2"
              >
                {filteredPerformers.every((fp) =>
                  selectedIndices.includes(fp.originalIndex)
                )
                  ? "선택 해제"
                  : "전체 선택"}
              </button>
            </div>

            {/* 인원 검색창 */}
            <div className="relative">
              <Input
                placeholder="공연자 이름, 기수, 세션으로 검색..."
                value={performerSearch}
                onChange={(e) => setPerformerSearch(e.target.value)}
                className="text-xs h-8 pl-8 bg-muted/30"
              />
              <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-2.5 pointer-events-none" />
            </div>

            {/* 공연자 체크박스 리스트 */}
            <div className="border border-border/70 rounded-xl max-h-52 overflow-y-auto divide-y divide-border/60 bg-background/50">
              {filteredPerformers.length > 0 ? (
                filteredPerformers.map(({ performer, originalIndex }) => {
                  const isChecked = selectedIndices.includes(originalIndex);
                  const parts = (performer.part || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const alreadyHasSession =
                    sessionName.trim() && parts.includes(sessionName.trim());

                  return (
                    <div
                      key={performer.email || performer.id || originalIndex}
                      onClick={() => handleToggleIndex(originalIndex)}
                      className={cn(
                        "p-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors",
                        isChecked ? "bg-primary/5" : "hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggleIndex(originalIndex)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {performer.photo_url ? (
                          <img
                            src={performer.photo_url}
                            alt={performer.name}
                            className="size-7 rounded-full object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="size-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground border border-border shrink-0">
                            <User className="size-3.5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">
                              {performer.name}
                            </span>
                            {performer.generation && (
                              <span className="text-[10px] px-1 py-0.2 rounded bg-muted text-muted-foreground font-mono">
                                {performer.generation}기
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {parts.length > 0 ? (
                              parts.map((pt) => (
                                <span
                                  key={pt}
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.2 rounded font-medium",
                                    pt === sessionName.trim()
                                      ? "bg-primary/15 text-primary font-bold"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {pt}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-muted-foreground/60">
                                배정 세션 없음
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {alreadyHasSession ? (
                        <span className="text-[10px] font-semibold text-muted-foreground/70 shrink-0">
                          이미 보유
                        </span>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  일치하는 공연자가 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* 모달 하단 액션 버튼 */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-8"
            >
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!sessionName.trim() || selectedIndices.length === 0}
              className="text-xs font-bold h-8 px-4 gap-1"
            >
              <Plus className="size-3.5" />
              <span>
                {sessionName.trim()
                  ? `'${sessionName.trim()}' 세션 할당 (${selectedIndices.length}명)`
                  : "세션 할당"}
              </span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
