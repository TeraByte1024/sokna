"use client";

import React, { useRef, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import {
  UserPlus,
  ClipboardType,
  ChevronDown,
  ChevronUp,
  Users,
  Trash2,
  Loader2,
  Check,
  AlertTriangle,
  Link2,
  Plus,
  X,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PerformerMappingDialog } from "@/components/gigs/performer-mapping-dialog";
import { SessionAssignmentDialog } from "@/components/gigs/session-assignment-dialog";

export interface Performer {
  id?: string;
  name: string;
  email?: string;
  generation?: number | null;
  part?: string | null;
  photo_url?: string | null;
}

export function isPerformerLinked(p: Performer): boolean {
  return Boolean(p.id && (!p.email || !p.email.startsWith("temp-")));
}

interface Props {
  search: string;
  setSearch: (v: string) => void;
  results: Performer[];
  selected: Performer[];
  onAdd: (p: Performer) => void;
  onRemove: (email: string) => void;
  onBulkAdd: ((names: string[]) => void) | ((performers: Performer[]) => void);
  onBulkAddPerformers?: (performers: Performer[]) => void;
  onMapPerformer?: (index: number, mappedUser: Performer, oldName: string) => void;
  onUpdatePart: (index: number, part: string) => void;
  onUpdatePhoto?: (index: number, photoUrl: string) => void;
}

const COMMON_PARTS = [
  "보컬",
  "기타",
  "일렉기타",
  "어쿠스틱기타",
  "베이스",
  "드럼",
  "건반",
  "키보드",
  "신디사이저",
  "코러스",
  "브라스",
  "색소폰",
];

function PerformerPartDropdown({
  currentParts,
  onAddPart,
}: {
  currentParts: string[];
  onAddPart: (part: string) => void;
}) {
  const [customPart, setCustomPart] = useState("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-dashed border-border/80 transition-colors"
          title="세션 추가"
        >
          <Plus className="size-2.5" />
          <span>추가</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 max-h-72 overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
          세션 종류 추가
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COMMON_PARTS.map((cPart) => {
          const isAlready = currentParts.includes(cPart);
          return (
            <DropdownMenuItem
              key={cPart}
              disabled={isAlready}
              onClick={() => {
                if (!isAlready) onAddPart(cPart);
              }}
              className="text-xs cursor-pointer flex items-center justify-between py-1.5"
            >
              <span className={isAlready ? "text-muted-foreground" : "font-medium"}>
                {cPart}
              </span>
              {isAlready && <Check className="size-3 text-muted-foreground" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="p-1.5 flex gap-1">
          <Input
            type="text"
            placeholder="직접 입력..."
            value={customPart}
            onChange={(e) => setCustomPart(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = customPart.trim();
                if (trimmed && !currentParts.includes(trimmed)) {
                  onAddPart(trimmed);
                  setCustomPart("");
                }
              }
            }}
            className="h-7 text-xs bg-background"
          />
          <Button
            type="button"
            size="sm"
            disabled={!customPart.trim() || currentParts.includes(customPart.trim())}
            onClick={() => {
              const trimmed = customPart.trim();
              if (trimmed && !currentParts.includes(trimmed)) {
                onAddPart(trimmed);
                setCustomPart("");
              }
            }}
            className="h-7 px-2 text-xs"
          >
            추가
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type PerformerSortField = "name" | "generation" | "default";
export type PerformerSortOrder = "asc" | "desc";

export function PerformerSelector({
  search,
  setSearch,
  results,
  selected,
  onAdd,
  onRemove,
  onBulkAdd,
  onBulkAddPerformers,
  onMapPerformer,
  onUpdatePart,
}: Props) {
  const supabase = createClient();
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);

  // 정렬 상태: 기본값은 "이름순 (이름 > 기수)"
  const [sortField, setSortField] = useState<PerformerSortField>("name");
  const [sortOrder, setSortOrder] = useState<PerformerSortOrder>("asc");

  // 수동 매핑 모달 대상 상태
  const [mappingTarget, setMappingTarget] = useState<{
    performer: Performer;
    index: number;
  } | null>(null);

  // 세션 필터 및 세션 추가 모달 상태
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<string | null>(null);
  const [isAddSessionDialogOpen, setIsAddSessionDialogOpen] = useState(false);

  // 현재 공연에 등록된 전체 세션 목록
  const gigSessions = useMemo(() => {
    const set = new Set<string>();
    selected.forEach((p) => {
      (p.part || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [selected]);

  // 필터링 및 정렬된 공연자 목록 (원래 인덱스 보존)
  const displayedPerformers = useMemo(() => {
    let list = selected.map((p, idx) => ({ performer: p, originalIndex: idx }));

    // 1. 세션 필터링
    if (selectedSessionFilter) {
      list = list.filter(({ performer }) => {
        const parts = (performer.part || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return parts.includes(selectedSessionFilter);
      });
    }

    // 2. 정렬 적용
    return list.slice().sort((a, b) => {
      if (sortField === "name") {
        // 1순위: 이름 (가나다순)
        const cmp = a.performer.name.localeCompare(b.performer.name, "ko");
        if (cmp !== 0) {
          return sortOrder === "asc" ? cmp : -cmp;
        }
        // 2순위: 기수 (기본 이름 > 기수 정렬)
        const genA = a.performer.generation ?? (sortOrder === "asc" ? 9999 : -1);
        const genB = b.performer.generation ?? (sortOrder === "asc" ? 9999 : -1);
        return sortOrder === "asc" ? genA - genB : genB - genA;
      }

      if (sortField === "generation") {
        // 1순위: 기수
        const genA = a.performer.generation ?? (sortOrder === "asc" ? 9999 : -1);
        const genB = b.performer.generation ?? (sortOrder === "asc" ? 9999 : -1);
        if (genA !== genB) {
          return sortOrder === "asc" ? genA - genB : genB - genA;
        }
        // 2순위: 이름
        const cmp = a.performer.name.localeCompare(b.performer.name, "ko");
        return sortOrder === "asc" ? cmp : -cmp;
      }

      // "default": 등록 순서
      return a.originalIndex - b.originalIndex;
    });
  }, [selected, selectedSessionFilter, sortField, sortOrder]);

  const handleSortHeader = (field: PerformerSortField) => {
    if (field === "default") {
      setSortField("default");
      setSortOrder("asc");
      return;
    }
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // 일괄 세션 할당 핸들러
  const handleConfirmAssignSession = (sessionName: string, targetIndices: number[]) => {
    const trimmed = sessionName.trim();
    if (!trimmed || targetIndices.length === 0) return;

    targetIndices.forEach((idx) => {
      const p = selected[idx];
      if (!p) return;
      const currentParts = (p.part || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!currentParts.includes(trimmed)) {
        onUpdatePart(idx, [...currentParts, trimmed].join(", "));
      }
    });

    toast.success(`'${trimmed}' 세션이 ${targetIndices.length}명의 공연자에게 추가 할당되었습니다.`);
  };

  // 미연동 공연자 집계
  const unlinkedPerformers = selected
    .map((p, idx) => ({ performer: p, index: idx }))
    .filter(({ performer }) => !isPerformerLinked(performer));
  const unlinkedCount = unlinkedPerformers.length;

  // 일괄 붙여넣기 텍스트 파싱
  const parsedNames = pasteText
    .split(/\r?\n|\t/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // 일괄 붙여넣기 시 스마트 자동 매핑 수행
  const handleApplyBulk = async () => {
    if (parsedNames.length === 0 || isApplyingBulk) return;
    setIsApplyingBulk(true);

    try {
      // 1. users 테이블에서 붙여넣은 이름들을 한 번에 조회
      const { data: matchedUsers, error: fetchErr } = await supabase
        .from("users")
        .select("id, name, email, generation, part")
        .in("name", parsedNames)
        .neq("status", "rejected");

      if (fetchErr) {
        console.error("부원 목록 조회 실패:", fetchErr);
      }

      // 2. 이름별 매칭 그룹화
      const userMap = new Map<
        string,
        Array<{
          id: string;
          name: string;
          email?: string | null;
          generation?: number | null;
          part?: string | null;
        }>
      >();

      (matchedUsers ?? []).forEach((u) => {
        const list = userMap.get(u.name) || [];
        list.push(u);
        userMap.set(u.name, list);
      });

      let autoLinkedCount = 0;
      let unlinkedCountInBatch = 0;

      const newPerformers: Performer[] = parsedNames.map((name) => {
        const matched = userMap.get(name);
        // 정확히 1명만 유일하게 일치하는 경우 자동 연동
        if (matched && matched.length === 1) {
          const u = matched[0];
          autoLinkedCount++;
          return {
            id: u.id,
            name: u.name,
            email: u.email ?? undefined,
            generation: u.generation ?? null,
            part: u.part || "세션",
          };
        } else {
          // 0명이거나 2명 이상(동명이인)인 경우 미연동으로 등록 후 수동 매핑 유도
          unlinkedCountInBatch++;
          return {
            name,
            email: `temp-${Math.random().toString(36).substring(2, 9)}`,
            part: "세션",
          };
        }
      });

      if (onBulkAddPerformers) {
        onBulkAddPerformers(newPerformers);
      } else {
        // 타입 캐스팅으로 안전하게 전달
        (onBulkAdd as (items: Performer[] | string[]) => void)(newPerformers);
      }

      setPasteText("");
      setShowPasteBox(false);

      if (autoLinkedCount > 0 && unlinkedCountInBatch > 0) {
        toast.info(
          `${parsedNames.length}명 추가: ${autoLinkedCount}명 자동 연동 완료, ${unlinkedCountInBatch}명 미연동 (수동 매핑 필요)`
        );
      } else if (unlinkedCountInBatch > 0) {
        toast.warning(
          `${parsedNames.length}명 추가: 일치하는 회원이 없어 미연동 상태입니다. 각 행의 [연동] 버튼을 눌러 매핑해주세요.`
        );
      } else {
        toast.success(`${parsedNames.length}명의 공연자가 모두 자동 연동되었습니다.`);
      }
    } catch (e) {
      console.error("일괄 붙여넣기 처리 중 오류:", e);
      // 예외 발생 시 기본 이름 추가 fallback
      (onBulkAdd as (names: string[]) => void)(parsedNames);
      setPasteText("");
      setShowPasteBox(false);
    } finally {
      setIsApplyingBulk(false);
    }
  };

  const handleOpenMapping = (performer: Performer, index: number) => {
    setMappingTarget({ performer, index });
  };

  const handleConfirmMapping = (index: number, mappedUser: Performer, oldName: string) => {
    if (onMapPerformer) {
      onMapPerformer(index, mappedUser, oldName);
    }
    setMappingTarget(null);
  };

  return (
    <div className="space-y-4 pt-1">

      {/* 수동 매핑 모달 */}
      <PerformerMappingDialog
        isOpen={mappingTarget !== null}
        onClose={() => setMappingTarget(null)}
        targetPerformer={mappingTarget?.performer ?? null}
        targetIndex={mappingTarget?.index ?? null}
        onConfirmMapping={handleConfirmMapping}
      />

      {/* 세션 추가 및 인원 할당 모달 */}
      <SessionAssignmentDialog
        isOpen={isAddSessionDialogOpen}
        onClose={() => setIsAddSessionDialogOpen(false)}
        performers={selected}
        onConfirmAssign={handleConfirmAssignSession}
      />

      {/* 미연동 안내 요약 배너 */}
      {unlinkedCount > 0 && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs shadow-xs">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 flex-1 min-w-0">
            <p className="font-bold">
              미연동 공연자 {unlinkedCount}명 감지됨
            </p>
            <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
              가입된 회원 계정과 연동되지 않은 공연자는 임시 더미 상태로 안전하게 저장됩니다. 지금 바로 각 행의 <strong className="font-semibold text-amber-950 dark:text-amber-100">[🔗 연동]</strong> 버튼을 눌러 부원 계정과 매핑하거나 추후 언제든 수정할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 1. 멤버 검색 인풋 & 자동완성 결과 (기수 및 세션 파트 함께 표시) */}
      <div className="relative">
        <div className="relative">
          <Input
            placeholder="이름이나 이메일로 부원 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 text-sm"
          />
          <UserPlus className="absolute right-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
        </div>

        {results.length > 0 && (
          <ul className="absolute z-50 w-full bg-popover text-popover-foreground border border-border rounded-xl shadow-xl mt-1.5 max-h-64 overflow-auto divide-y divide-border/60">
            {results.map((u) => (
              <li
                key={u.id || u.email}
                className="p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer flex justify-between items-center transition-colors gap-3"
                onClick={() => onAdd(u)}
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-foreground">{u.name}</span>
                    {u.generation && (
                      <span className="text-xs px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono font-medium">
                        {u.generation}기
                      </span>
                    )}
                    {u.part && (
                      <span className="text-xs px-1.5 py-0.2 rounded bg-primary/10 text-primary font-medium">
                        {u.part}
                      </span>
                    )}
                  </div>
                  {u.email && (
                    <span className="text-xs text-muted-foreground truncate mt-0.5">{u.email}</span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs px-3 shrink-0 font-medium"
                >
                  추가
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2. 엑셀 명단 일괄 붙여넣기 토글 영역 */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPasteBox(!showPasteBox)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ClipboardType className="size-3.5" />
          <span>엑셀 명단 일괄 붙여넣기</span>
          {showPasteBox ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>

        {showPasteBox && (
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                엑셀이나 스프레드시트의 이름 목록을 복사하여 아래 칸에 붙여넣은 뒤 [명단 적용]을 누르면 등록된 회원을 자동 감지하여 연동합니다.
              </p>
              {parsedNames.length > 0 && (
                <span className="text-[11px] font-semibold text-primary">
                  {parsedNames.length}명 감지됨
                </span>
              )}
            </div>
            <textarea
              className="w-full h-24 p-3 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-none font-mono"
              placeholder="홍길동&#10;이영희&#10;박민수"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="flex items-center justify-end gap-2 pt-0.5">
              {pasteText && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPasteText("")}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  지우기
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleApplyBulk}
                disabled={parsedNames.length === 0 || isApplyingBulk}
                className="h-7 text-xs font-semibold px-3 gap-1"
              >
                {isApplyingBulk ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                    회원 연동 조회 중...
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" />
                    명단 적용 ({parsedNames.length}명)
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 3. 공연자 명단 테이블 (프로필 사진, 연동 상태, 세션 수정 및 매핑 기능 포함) */}
      <div className="space-y-2.5">
        {selected.length > 0 && (
          /* 세션 필터 칩 바 및 세션 추가 버튼 */
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setSelectedSessionFilter(null)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0 cursor-pointer",
                selectedSessionFilter === null
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground border-border/70 hover:bg-muted"
              )}
            >
              전체 <span className="text-[11px] font-mono opacity-80">({selected.length})</span>
            </button>
            {gigSessions.map((session) => {
              const count = selected.filter((p) =>
                (p.part || "").split(",").map((s) => s.trim()).includes(session)
              ).length;
              const isActive = selectedSessionFilter === session;
              return (
                <button
                  key={session}
                  type="button"
                  onClick={() => setSelectedSessionFilter(isActive ? null : session)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0 cursor-pointer",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground border-border/70 hover:bg-muted"
                  )}
                >
                  {session} <span className="text-[11px] font-mono opacity-80">({count})</span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5 gap-1.5 font-medium border-border/80 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                  >
                    <ArrowUpDown className="size-3 text-primary" />
                    <span>
                      {sortField === "name" && (sortOrder === "asc" ? "이름순 (ㄱ-ㅎ)" : "이름순 (ㅎ-ㄱ)")}
                      {sortField === "generation" && (sortOrder === "asc" ? "기수순 (오름차순)" : "기수순 (내림차순)")}
                      {sortField === "default" && "등록순"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 text-xs">
                  <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                    공연자 정렬
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField("name");
                      setSortOrder("asc");
                    }}
                    className="flex items-center justify-between cursor-pointer py-1.5"
                  >
                    <span>이름순 (이름 &gt; 기수)</span>
                    {sortField === "name" && sortOrder === "asc" && (
                      <Check className="size-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField("name");
                      setSortOrder("desc");
                    }}
                    className="flex items-center justify-between cursor-pointer py-1.5"
                  >
                    <span>이름 역순 (ㅎ-ㄱ)</span>
                    {sortField === "name" && sortOrder === "desc" && (
                      <Check className="size-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField("generation");
                      setSortOrder("asc");
                    }}
                    className="flex items-center justify-between cursor-pointer py-1.5"
                  >
                    <span>기수순 (기수 &gt; 이름)</span>
                    {sortField === "generation" && sortOrder === "asc" && (
                      <Check className="size-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField("generation");
                      setSortOrder("desc");
                    }}
                    className="flex items-center justify-between cursor-pointer py-1.5"
                  >
                    <span>기수 역순 (높은 기수부터)</span>
                    {sortField === "generation" && sortOrder === "desc" && (
                      <Check className="size-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setSortField("default");
                      setSortOrder("asc");
                    }}
                    className="flex items-center justify-between cursor-pointer py-1.5"
                  >
                    <span>등록순</span>
                    {sortField === "default" && <Check className="size-3.5 text-primary" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={() => setIsAddSessionDialogOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all shrink-0 cursor-pointer shadow-2xs"
                title="새 세션 추가 및 인원 할당"
              >
                <Plus className="size-3" />
                <span>세션 추가</span>
              </button>
            </div>
          </div>
        )}

        {selected.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border/60 uppercase font-semibold text-xs">
                  <tr>
                    <th
                      scope="col"
                      onClick={() => handleSortHeader("default")}
                      className="px-3 py-2.5 w-10 text-center font-mono cursor-pointer hover:bg-muted/80 hover:text-foreground select-none transition-colors"
                      title="등록순 정렬"
                    >
                      #
                    </th>
                    <th
                      scope="col"
                      onClick={() => handleSortHeader("name")}
                      className="px-3 py-2.5 min-w-[90px] cursor-pointer hover:bg-muted/80 hover:text-foreground select-none transition-colors group"
                      title="이름순 정렬 (클릭하여 오름/내림차순 전환)"
                    >
                      <div className="flex items-center gap-1">
                        <span className={sortField === "name" ? "text-foreground font-bold" : ""}>
                          이름
                        </span>
                        {sortField === "name" ? (
                          sortOrder === "asc" ? (
                            <ChevronUp className="size-3.5 text-primary" />
                          ) : (
                            <ChevronDown className="size-3.5 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        )}
                      </div>
                    </th>
                    <th
                      scope="col"
                      onClick={() => handleSortHeader("generation")}
                      className="px-3 py-2.5 w-16 text-center cursor-pointer hover:bg-muted/80 hover:text-foreground select-none transition-colors group"
                      title="기수순 정렬 (클릭하여 오름/내림차순 전환)"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className={sortField === "generation" ? "text-foreground font-bold" : ""}>
                          기수
                        </span>
                        {sortField === "generation" ? (
                          sortOrder === "asc" ? (
                            <ChevronUp className="size-3.5 text-primary" />
                          ) : (
                            <ChevronDown className="size-3.5 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        )}
                      </div>
                    </th>
                    <th scope="col" className="px-3 py-2.5 min-w-[150px]">세션 (파트)</th>
                    <th scope="col" className="px-3 py-2.5 w-16 text-center"></th>
                    <th scope="col" className="px-3 py-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayedPerformers.length > 0 ? (
                    displayedPerformers.map(({ performer: p, originalIndex: idx }, renderIdx) => {
                      const linked = isPerformerLinked(p);
                      const parts = (p.part || "")
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);

                      return (
                        <tr
                          key={p.email || p.id || `${p.name}-${idx}`}
                          className={`transition-colors ${
                            linked ? "hover:bg-muted/20" : "bg-amber-500/5 hover:bg-amber-500/10"
                          }`}
                        >
                          {/* 1. 번호 */}
                          <td className="px-3 py-2 text-center font-mono text-muted-foreground">
                            {renderIdx + 1}
                          </td>

                          {/* 2. 이름 */}
                          <td className="px-3 py-2 font-semibold text-foreground">
                            <span className={linked ? "" : "text-amber-800 dark:text-amber-200"}>
                              {p.name}
                            </span>
                          </td>

                          {/* 3. 기수 */}
                          <td className="px-3 py-2 text-center">
                            {p.generation ? (
                              <span className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-0.5 text-[11px] font-bold rounded-md bg-secondary text-secondary-foreground border border-border/50 font-mono">
                                {p.generation}기
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 font-mono">—</span>
                            )}
                          </td>

                          {/* 4. 세션 (다중 세션 뱃지: 추가 및 삭제 지원) */}
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-[140px]">
                              {parts.map((part) => (
                                <span
                                  key={part}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary border border-primary/20"
                                >
                                  <span>{part}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextParts = parts.filter((pt) => pt !== part);
                                      onUpdatePart(idx, nextParts.join(", "));
                                    }}
                                    className="text-primary/70 hover:text-destructive transition-colors ml-0.5"
                                    title={`${part} 삭제`}
                                  >
                                    <X className="size-2.5" />
                                  </button>
                                </span>
                              ))}

                              <PerformerPartDropdown
                                currentParts={parts}
                                onAddPart={(newPart) => {
                                  onUpdatePart(idx, [...parts, newPart].join(", "));
                                }}
                              />
                            </div>
                          </td>

                          {/* 5. 수동 매핑 버튼 (미연동 툴팁 통합) */}
                          <td className="px-3 py-2 text-center">
                            {linked ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenMapping(p, idx)}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                                title="다른 부원 계정으로 매핑 변경"
                              >
                                <Link2 className="size-3" />
                                <span className="text-[11px]">변경</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleOpenMapping(p, idx)}
                                className="h-7 px-2.5 text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 gap-1 shadow-none"
                                title="가입된 회원과 연동되지 않았습니다. 클릭하여 부원 계정과 매핑하세요."
                              >
                                <Link2 className="size-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="text-[11px]">연동</span>
                              </Button>
                            )}
                          </td>

                          {/* 6. 삭제 버튼 */}
                          <td className="px-3 py-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => onRemove(p.email || p.name)}
                              className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors rounded-lg"
                              aria-label={`${p.name} 삭제`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                        '{selectedSessionFilter}' 세션에 배정된 공연자가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="py-7 text-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-muted-foreground text-xs space-y-1">
            <p className="font-medium">등록된 공연자가 없습니다.</p>
            <p className="text-muted-foreground/80">
              위 검색창에서 부원을 검색하여 추가하거나, 엑셀 명단을 일괄 붙여넣기하세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}