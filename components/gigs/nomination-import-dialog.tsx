"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import {
  sortParts,
  type RecommendedVocal,
} from "@/lib/nomination";
import {
  serializeSessionSlots,
  type SessionSlot,
} from "@/lib/gig";
import {
  Search,
  X,
  Loader2,
  Check,
  Music,
  ListPlus,
  FileText,
  Mic,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ImportedSongPayload {
  title: string;
  artist: string;
  session_members: string;
}

interface NominationItem {
  id: number;
  gig_id: number;
  title: string;
  artist: string | null;
  required_parts: string[];
  recommended_vocals: RecommendedVocal[];
  sheet_exists: boolean;
  description: string | null;
  created_at: string;
  createdBy: {
    name: string;
    generation?: number | null;
    part?: string | null;
  } | null;
}

interface NominationImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  gigId?: number;
  onImportSongs: (songs: ImportedSongPayload[]) => void;
}

const DEFAULT_BASE_SLOTS: SessionSlot[] = [
  { sessionName: "보컬", members: [] },
  { sessionName: "기타", members: [] },
  { sessionName: "베이스", members: [] },
  { sessionName: "키보드", members: [] },
  { sessionName: "드럼", members: [] },
];

export function NominationImportDialog({
  isOpen,
  onClose,
  gigId,
  onImportSongs,
}: NominationImportDialogProps) {
  const supabase = createClient();
  const [nominations, setNominations] = useState<NominationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 후보곡 목록 불러오기
  useEffect(() => {
    if (!isOpen || !gigId) {
      setSelectedIds(new Set());
      setSearchQuery("");
      return;
    }

    const fetchNominations = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("nominations")
          .select(
            `
            id,
            gig_id,
            title,
            artist,
            required_parts,
            recommended_vocals,
            sheet_exists,
            description,
            created_at,
            created_by:performers (
              id,
              part,
              name,
              user_id,
              users (
                name,
                generation
              )
            )
          `
          )
          .eq("gig_id", gigId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("후보곡 불러오기 실패:", error);
          toast.error("선곡회의 곡 목록을 불러오지 못했습니다: " + error.message);
          return;
        }

        const mapped: NominationItem[] = (data ?? []).map((row: any) => {
          const performer = row.created_by;
          const user = performer?.users;
          const creatorName = user?.name || performer?.name || null;

          const rawVocals = row.recommended_vocals as unknown as RecommendedVocal[] | null;
          const safeVocals: RecommendedVocal[] = Array.isArray(rawVocals)
            ? rawVocals.map((v) => ({
                id: Number(v.id),
                name: v.name || "",
                generation: v.generation ?? null,
                part: v.part || "",
              }))
            : [];

          return {
            id: row.id,
            gig_id: row.gig_id,
            title: row.title || "제목 없음",
            artist: row.artist || "",
            required_parts: Array.isArray(row.required_parts) ? row.required_parts : [],
            recommended_vocals: safeVocals,
            sheet_exists: Boolean(row.sheet_exists),
            description: row.description || "",
            created_at: row.created_at,
            createdBy: creatorName
              ? {
                  name: creatorName,
                  generation: user?.generation ?? null,
                  part: performer?.part ?? null,
                }
              : null,
          };
        });

        setNominations(mapped);
      } catch (err) {
        console.error("후보곡 조회 중 에러:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNominations();
  }, [isOpen, gigId, supabase]);

  // 검색 필터링된 후보곡 목록
  const filteredNominations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return nominations;

    return nominations.filter((n) => {
      const titleMatch = n.title.toLowerCase().includes(q);
      const artistMatch = (n.artist || "").toLowerCase().includes(q);
      const creatorMatch = n.createdBy?.name.toLowerCase().includes(q);
      const partMatch = n.required_parts.some((p) => p.toLowerCase().includes(q));
      return titleMatch || artistMatch || creatorMatch || partMatch;
    });
  }, [nominations, searchQuery]);

  // 전체 선택/해제 토글
  const allFilteredSelected =
    filteredNominations.length > 0 &&
    filteredNominations.every((n) => selectedIds.has(n.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredNominations.forEach((n) => next.delete(n.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredNominations.forEach((n) => next.add(n.id));
        return next;
      });
    }
  };

  // 개별 행 선택 토글
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 셋리스트로 가져오기 실행
  const handleApply = () => {
    const selectedList = nominations.filter((n) => selectedIds.has(n.id));
    if (selectedList.length === 0) return;

    const songsToImport: ImportedSongPayload[] = selectedList.map((nom) => {
      // 기본 슬롯 구조 복제
      const slots: SessionSlot[] = DEFAULT_BASE_SLOTS.map((s) => ({
        sessionName: s.sessionName,
        members: [...s.members],
      }));

      // 후보곡에 추천 보컬이 지정되어 있다면 보컬 슬롯에 미리 채움
      if (nom.recommended_vocals && nom.recommended_vocals.length > 0) {
        const vocalSlot = slots.find((s) => s.sessionName === "보컬");
        if (vocalSlot) {
          nom.recommended_vocals.forEach((v) => {
            if (v.name && !vocalSlot.members.includes(v.name)) {
              vocalSlot.members.push(v.name);
            }
          });
        }
      }

      return {
        title: nom.title,
        artist: nom.artist || "",
        session_members: serializeSessionSlots(slots),
      };
    });

    onImportSongs(songsToImport);
    toast.success(`선곡회의 후보곡 ${songsToImport.length}곡을 셋리스트에 추가했습니다.`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* 1. 헤더 */}
        <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <ListPlus className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-foreground truncate flex items-center gap-1.5">
                선곡회의 곡 가져오기
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                선곡회의에 등록된 후보곡을 선택하여 실제 공연 셋리스트에 추가합니다.
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

        {/* 2. 검색 및 컨트롤 바 */}
        <div className="p-4 border-b border-border/60 bg-background space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="곡명, 아티스트, 추천자, 세션으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 bg-muted/30 text-xs sm:text-sm h-9 rounded-xl border-border focus-visible:ring-primary/40"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <label className="flex items-center gap-2 font-medium cursor-pointer text-muted-foreground hover:text-foreground select-none">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={handleToggleSelectAll}
                disabled={filteredNominations.length === 0}
              />
              <span>
                전체 선택{" "}
                <span className="font-mono text-muted-foreground/80">
                  ({filteredNominations.length}곡 중 {selectedIds.size}곡 선택됨)
                </span>
              </span>
            </label>

            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              >
                선택 초기화
              </button>
            )}
          </div>
        </div>

        {/* 3. 곡 목록 리스트 */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">
                선곡회의 후보곡 목록을 불러오는 중입니다...
              </p>
            </div>
          ) : filteredNominations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2 border border-dashed border-border/80 rounded-xl bg-muted/10">
              <Music className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-muted-foreground">
                {searchQuery ? "검색 결과와 일치하는 곡이 없습니다." : "등록된 선곡회의 후보곡이 없습니다."}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  검색어 지우기
                </button>
              )}
            </div>
          ) : (
            filteredNominations.map((nom) => {
              const isSelected = selectedIds.has(nom.id);
              const sortedSessionParts = sortParts(Array.from(new Set(nom.required_parts || [])));

              return (
                <div
                  key={nom.id}
                  onClick={() => handleToggleSelect(nom.id)}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none",
                    isSelected
                      ? "border-primary/60 bg-primary/5 shadow-xs"
                      : "border-border/70 bg-background/80 hover:border-border hover:bg-muted/30"
                  )}
                >
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleSelect(nom.id)}
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* 곡 제목 & 아티스트 & 악보 뱃지 */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span className="font-bold text-foreground text-sm truncate">
                          {nom.title}
                        </span>
                        {nom.artist ? (
                          <span className="text-xs text-muted-foreground truncate font-medium">
                            — {nom.artist}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60 italic">
                            (아티스트 미정)
                          </span>
                        )}
                      </div>

                      {/* 악보 뱃지 */}
                      <span
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 border",
                          nom.sheet_exists
                            ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : "text-muted-foreground bg-muted border-border/70"
                        )}
                      >
                        악보 {nom.sheet_exists ? "보유" : "미보유"}
                      </span>
                    </div>

                    {/* 세션 뱃지 (보컬 -> 기타 -> 베이스 -> 드럼 -> 건반 순) */}
                    <div className="flex flex-wrap items-center gap-1">
                      {sortedSessionParts.length > 0 ? (
                        sortedSessionParts.map((part) => {
                          const count = nom.required_parts.filter((p) => p === part).length;

                          return (
                            <span
                              key={part}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-muted text-muted-foreground border-border/60"
                            >
                              <span>{part}</span>
                              {count > 1 && (
                                <span className="font-bold opacity-80">{count}</span>
                              )}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-muted-foreground/70">
                          세션 미지정
                        </span>
                      )}
                    </div>

                    {/* 추천 보컬 표시 (있을 경우) */}
                    {nom.recommended_vocals && nom.recommended_vocals.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
                        <Mic className="size-3 shrink-0" />
                        <span className="truncate">
                          추천 보컬:{" "}
                          {nom.recommended_vocals.map((v) => v.name).join(", ")}
                        </span>
                      </div>
                    )}

                    {/* 추천 사유 한 줄 어필 (있을 경우) */}
                    {nom.description && (
                      <p className="text-[11px] text-muted-foreground/80 truncate italic">
                        &ldquo;{nom.description}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* 등록자 정보 */}
                  {nom.createdBy && (
                    <div className="text-[10px] text-muted-foreground font-mono shrink-0 text-right pt-0.5">
                      {nom.createdBy.generation ? `${nom.createdBy.generation}기 ` : ""}
                      {nom.createdBy.name}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 4. 푸터 액션 */}
        <div className="p-3 sm:p-4 border-t border-border/80 bg-muted/10 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground font-mono">
            선택된 곡: <strong className="text-foreground font-semibold">{selectedIds.size}</strong>곡
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs font-medium"
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleApply}
              className="h-8 text-xs font-semibold px-4 gap-1.5 shadow-sm shadow-primary/20"
            >
              <Check className="size-3.5" />
              선택한 {selectedIds.size > 0 ? `${selectedIds.size}곡 ` : ""}추가하기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
