"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { parseSessionSlots, type SessionSlot } from "@/lib/gig";
import {
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Check,
  X,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const DEFAULT_BAND_SESSION_ORDER = [
  "보컬",
  "기타",
  "베이스",
  "건반",
  "신디사이저",
  "드럼",
  "코러스",
  "브라스",
  "색소폰",
];

export const RHYTHM_FIRST_SESSION_ORDER = [
  "드럼",
  "베이스",
  "기타",
  "건반",
  "신디사이저",
  "보컬",
  "코러스",
  "브라스",
  "색소폰",
];

export interface SessionOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Array<{ session_members?: string | null }>;
  newSongSlots?: SessionSlot[];
  initialOrder?: string[];
  onApplyOrder: (orderedSessionNames: string[]) => void;
}

export function SessionOrderDialog({
  isOpen,
  onClose,
  songs,
  newSongSlots = [],
  initialOrder,
  onApplyOrder,
}: SessionOrderDialogProps) {
  // 곡들에서 현재 실제로 사용 중인 모든 세션명 및 사용 횟수 집계
  const { songSessionNames, usageCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    const namesSet = new Set<string>();

    songs.forEach((song) => {
      const slots = parseSessionSlots(song.session_members);
      slots.forEach((s) => {
        const name = s.sessionName.trim();
        if (name) {
          namesSet.add(name);
          counts[name] = (counts[name] || 0) + 1;
        }
      });
    });

    newSongSlots.forEach((s) => {
      const name = s.sessionName.trim();
      if (name) {
        namesSet.add(name);
      }
    });

    return {
      songSessionNames: Array.from(namesSet),
      usageCounts: counts,
    };
  }, [songs, newSongSlots]);

  // 편집 중인 세션 순서 목록 상태
  const [orderedSessions, setOrderedSessions] = useState<string[]>([]);
  const [newSessionInput, setNewSessionInput] = useState("");

  // 다이얼로그가 열릴 때 초기 순서 세팅
  useEffect(() => {
    if (!isOpen) return;

    const baseOrder = initialOrder && initialOrder.length > 0
      ? initialOrder
      : DEFAULT_BAND_SESSION_ORDER;

    // baseOrder에 있는 항목 먼저 넣고, songs에서 발견된 추가 세션들을 뒤에 병합
    const merged: string[] = [];
    const seen = new Set<string>();

    baseOrder.forEach((name) => {
      const trimmed = name.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        merged.push(trimmed);
      }
    });

    songSessionNames.forEach((name) => {
      if (!seen.has(name)) {
        seen.add(name);
        merged.push(name);
      }
    });

    setOrderedSessions(merged);
    setNewSessionInput("");
  }, [isOpen, initialOrder, songSessionNames]);

  // ESC 키 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 순서 변경 함수들
  const moveSession = (idx: number, delta: number) => {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= orderedSessions.length) return;

    setOrderedSessions((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const moveToTop = (idx: number) => {
    if (idx <= 0) return;
    setOrderedSessions((prev) => {
      const item = prev[idx];
      const rest = prev.filter((_, i) => i !== idx);
      return [item, ...rest];
    });
  };

  const moveToBottom = (idx: number) => {
    if (idx >= orderedSessions.length - 1) return;
    setOrderedSessions((prev) => {
      const item = prev[idx];
      const rest = prev.filter((_, i) => i !== idx);
      return [...rest, item];
    });
  };

  const handleAddSession = () => {
    const trimmed = newSessionInput.trim();
    if (!trimmed) return;

    if (orderedSessions.includes(trimmed)) {
      toast.info(`'${trimmed}' 세션은 이미 목록에 있습니다.`);
      return;
    }

    setOrderedSessions((prev) => [...prev, trimmed]);
    setNewSessionInput("");
    toast.success(`'${trimmed}' 세션이 순서 목록에 추가되었습니다.`);
  };

  const handleRemoveSession = (name: string) => {
    const usage = usageCounts[name] || 0;
    if (usage > 0) {
      toast.error(`'${name}' 세션은 현재 ${usage}개 곡에서 사용 중이므로 삭제할 수 없습니다.`);
      return;
    }

    setOrderedSessions((prev) => prev.filter((s) => s !== name));
    toast.info(`'${name}' 세션이 순서 목록에서 제거되었습니다.`);
  };

  // 프리셋 적용
  const handleApplyPreset = (presetList: string[]) => {
    const next: string[] = [];
    const seen = new Set<string>();

    presetList.forEach((item) => {
      if (!seen.has(item) && orderedSessions.includes(item)) {
        seen.add(item);
        next.push(item);
      }
    });

    // 프리셋에 없는 기존 세션들은 뒤에 유지
    orderedSessions.forEach((item) => {
      if (!seen.has(item)) {
        seen.add(item);
        next.push(item);
      }
    });

    setOrderedSessions(next);
    toast.success("프리셋 순서가 목록에 반영되었습니다.");
  };

  // 가나다순 정렬
  const handleSortAlphabetical = () => {
    setOrderedSessions((prev) => [...prev].sort((a, b) => a.localeCompare(b, "ko-KR")));
    toast.success("가나다순으로 정렬되었습니다.");
  };

  // 최종 적용
  const handleApply = () => {
    onApplyOrder(orderedSessions);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 헤더 */}
        <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <SlidersHorizontal className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-foreground truncate flex items-center gap-1.5">
                세션 표시 순서 설정
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                셋리스트 내 모든 곡에 표시되는 세션 종류의 순서를 설정합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0"
            aria-label="닫기"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* 2. 빠른 프리셋 버튼 모음 */}
        <div className="px-4 sm:px-5 py-3 border-b border-border/60 bg-muted/10 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 shrink-0">
            <Sparkles className="size-3 text-primary" /> 빠른 프리셋:
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset(DEFAULT_BAND_SESSION_ORDER)}
            className="text-xs px-2.5 py-1 rounded-md bg-background hover:bg-muted border border-border text-foreground font-medium transition-colors shadow-2xs"
          >
            기본 밴드 순서 (보컬 우선)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset(RHYTHM_FIRST_SESSION_ORDER)}
            className="text-xs px-2.5 py-1 rounded-md bg-background hover:bg-muted border border-border text-foreground font-medium transition-colors shadow-2xs"
          >
            리듬 섹션 우선 (드럼 우선)
          </button>
          <button
            type="button"
            onClick={handleSortAlphabetical}
            className="text-xs px-2.5 py-1 rounded-md bg-background hover:bg-muted border border-border text-foreground font-medium transition-colors shadow-2xs"
          >
            가나다순
          </button>
        </div>

        {/* 3. 세션 목록 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-1.5 min-h-[220px]">
          {orderedSessions.map((sessionName, idx) => {
            const usage = usageCounts[sessionName] || 0;
            const isFirst = idx === 0;
            const isLast = idx === orderedSessions.length - 1;

            return (
              <div
                key={sessionName}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border/70 transition-all",
                  usage > 0
                    ? "bg-background shadow-2xs hover:border-primary/40"
                    : "bg-muted/30 border-dashed text-muted-foreground opacity-85"
                )}
              >
                {/* 좌측: 순번 뱃지 & 세션명 */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-5 rounded-md bg-muted text-muted-foreground font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-xs text-foreground truncate">
                    {sessionName}
                  </span>
                  {usage > 0 ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-medium py-0 h-4.5 bg-primary/10 text-primary border-primary/20 shrink-0"
                    >
                      {usage}곡 사용
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      미사용
                    </span>
                  )}
                </div>

                {/* 우측: 상하 이동 컨트롤 */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isFirst}
                    onClick={() => moveToTop(idx)}
                    className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    title="맨 위로 이동"
                  >
                    <ChevronsUp className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isFirst}
                    onClick={() => moveSession(idx, -1)}
                    className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    title="위로 이동"
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isLast}
                    onClick={() => moveSession(idx, 1)}
                    className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    title="아래로 이동"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isLast}
                    onClick={() => moveToBottom(idx)}
                    className="size-6 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    title="맨 아래로 이동"
                  >
                    <ChevronsDown className="size-3" />
                  </Button>

                  {/* 미사용 세션 삭제 버튼 */}
                  {usage === 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveSession(sessionName)}
                      className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-0.5"
                      title="순서 목록에서 제거"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 4. 새 세션 직접 추가 입력창 */}
        <div className="px-4 sm:px-5 py-3 border-t border-border/70 bg-muted/20">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="새 세션 종류 추가 (예: 어쿠스틱기타, 퍼커션)"
              value={newSessionInput}
              onChange={(e) => setNewSessionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAddSession();
                }
              }}
              className="h-8 text-xs bg-background border-border flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddSession}
              disabled={!newSessionInput.trim()}
              className="h-8 text-xs font-semibold px-3 gap-1 shrink-0 shadow-2xs"
            >
              <Plus className="size-3" /> 추가
            </Button>
          </div>
        </div>

        {/* 5. 푸터 버튼 */}
        <div className="p-4 sm:p-5 border-t border-border/80 flex items-center justify-between gap-3 bg-muted/30">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleApplyPreset(DEFAULT_BAND_SESSION_ORDER)}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2.5"
          >
            <RotateCcw className="size-3" /> 기본 순서 초기화
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs px-3"
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              className="h-8 text-xs font-semibold px-4 gap-1.5 shadow-xs"
            >
              <Check className="size-3.5" /> 순서 적용하기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
