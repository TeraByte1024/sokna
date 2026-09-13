"use client";

import React, { useRef, useState } from "react";
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
  Camera,
  Loader2,
  User,
  Check,
  AlertTriangle,
  Link2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PerformerMappingDialog } from "@/components/gigs/performer-mapping-dialog";

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
  onUpdatePhoto: (index: number, photoUrl: string) => void;
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
  onUpdatePhoto,
}: Props) {
  const supabase = createClient();
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetIdxForUpload, setTargetIdxForUpload] = useState<number | null>(null);

  // 수동 매핑 모달 대상 상태
  const [mappingTarget, setMappingTarget] = useState<{
    performer: Performer;
    index: number;
  } | null>(null);

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

  // 프로필 사진 파일 업로드 핸들러
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || targetIdxForUpload === null) return;

    setUploadingIdx(targetIdxForUpload);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `performers/${fileName}`;

      const { error } = await supabase.storage
        .from("gigs")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (error) throw error;

      const { data } = supabase.storage.from("gigs").getPublicUrl(filePath);
      onUpdatePhoto(targetIdxForUpload, data.publicUrl);
    } catch (err) {
      console.error("프로필 사진 업로드 실패:", err);
      alert("프로필 사진 업로드에 실패했습니다.");
    } finally {
      setUploadingIdx(null);
      setTargetIdxForUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerUpload = (idx: number) => {
    setTargetIdxForUpload(idx);
    fileInputRef.current?.click();
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
      {/* 숨겨진 파일 인풋 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        accept="image/*"
        className="hidden"
      />

      {/* 수동 매핑 모달 */}
      <PerformerMappingDialog
        isOpen={mappingTarget !== null}
        onClose={() => setMappingTarget(null)}
        targetPerformer={mappingTarget?.performer ?? null}
        targetIndex={mappingTarget?.index ?? null}
        onConfirmMapping={handleConfirmMapping}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <Label className="text-sm font-bold text-foreground">
            공연자
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {unlinkedCount > 0 && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              미연동 {unlinkedCount}명
            </span>
          )}
          <span className="text-xs text-muted-foreground">총 {selected.length}명</span>
        </div>
      </div>

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
      <div className="space-y-2">
        {selected.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border/60 uppercase font-semibold">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 w-10 text-center font-mono">#</th>
                    <th scope="col" className="px-3 py-2.5 w-14 text-center">프로필</th>
                    <th scope="col" className="px-3 py-2.5 min-w-[90px]">이름</th>
                    <th scope="col" className="px-3 py-2.5 w-16 text-center">기수</th>
                    <th scope="col" className="px-3 py-2.5 min-w-[150px]">세션 (파트)</th>
                    <th scope="col" className="px-3 py-2.5 w-16 text-center"></th>
                    <th scope="col" className="px-3 py-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {selected.map((p, idx) => {
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
                          {idx + 1}
                        </td>

                        {/* 2. 프로필 사진 등록/수정 */}
                        <td className="px-3 py-2 text-center">
                          <div className="relative inline-block group">
                            {p.photo_url ? (
                              <img
                                src={p.photo_url}
                                alt={p.name}
                                className="size-8.5 rounded-full object-cover border border-border"
                              />
                            ) : (
                              <div className="size-8.5 rounded-full bg-muted flex items-center justify-center text-muted-foreground border border-border">
                                <User className="size-4" />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => triggerUpload(idx)}
                              disabled={uploadingIdx === idx}
                              className="absolute inset-0 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="프로필 사진 등록/수정"
                            >
                              {uploadingIdx === idx ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Camera className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* 3. 이름 */}
                        <td className="px-3 py-2 font-semibold text-foreground">
                          <span className={linked ? "" : "text-amber-800 dark:text-amber-200"}>
                            {p.name}
                          </span>
                        </td>

                        {/* 4. 기수 */}
                        <td className="px-3 py-2 text-center">
                          {p.generation ? (
                            <span className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-0.5 text-[11px] font-bold rounded-md bg-secondary text-secondary-foreground border border-border/50 font-mono">
                              {p.generation}기
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 font-mono">—</span>
                          )}
                        </td>

                        {/* 5. 세션 (다중 세션 뱃지: 추가 및 삭제 지원) */}
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

                        {/* 6. 수동 매핑 버튼 (미연동 툴팁 통합) */}
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

                        {/* 7. 삭제 버튼 */}
                        <td className="px-3 py-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemove(p.email!)}
                            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors rounded-lg"
                            aria-label={`${p.name} 삭제`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
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