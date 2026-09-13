"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { Performer } from "@/components/performer-selector";
import {
  Search,
  UserCheck,
  X,
  Loader2,
  AlertTriangle,
  Link2,
} from "lucide-react";

interface PerformerMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetPerformer: Performer | null;
  targetIndex: number | null;
  onConfirmMapping: (index: number, mappedUser: Performer, oldName: string) => void;
}

interface UserSearchResult {
  id: string;
  name: string;
  email?: string | null;
  generation?: number | null;
  part?: string | null;
}

export function PerformerMappingDialog({
  isOpen,
  onClose,
  targetPerformer,
  targetIndex,
  onConfirmMapping,
}: PerformerMappingDialogProps) {
  const supabase = createClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 모달이 열릴 때 대상 공연자 이름으로 검색어 초기화 및 즉시 검색
  useEffect(() => {
    if (isOpen && targetPerformer) {
      const initialQuery = targetPerformer.name.trim();
      setSearchTerm(initialQuery);
      if (initialQuery) {
        searchUsers(initialQuery);
      } else {
        setResults([]);
      }
    }
  }, [isOpen, targetPerformer]);

  // 회원 검색 쿼리
  const searchUsers = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      let req = supabase
        .from("users")
        .select("id, name, email, generation, part")
        .neq("status", "rejected");

      const isNum = !isNaN(Number(trimmed));
      if (isNum) {
        req = req.or(`name.ilike.%${trimmed}%,generation.eq.${Number(trimmed)}`);
      } else {
        req = req.or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`);
      }

      const { data, error } = await req.limit(10);
      if (error) {
        console.error("회원 검색 실패:", error);
        setResults([]);
      } else {
        setResults(data ?? []);
      }
    } catch (err) {
      console.error("회원 검색 중 예외 발생:", err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 검색어 입력 디바운스
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      searchUsers(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, isOpen]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !targetPerformer || targetIndex === null) return null;

  const handleApply = (userToMap: UserSearchResult) => {
    const oldName = targetPerformer.name;
    const mapped: Performer = {
      id: userToMap.id,
      name: userToMap.name,
      email: userToMap.email ?? undefined,
      generation: userToMap.generation ?? null,
      part: targetPerformer.part || userToMap.part || "세션",
      photo_url: targetPerformer.photo_url || null,
    };
    onConfirmMapping(targetIndex, mapped, oldName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150">
      <div
        className="w-full max-w-lg bg-card text-card-foreground border border-border/80 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 모달 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-border/70 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Link2 className="size-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                부원 계정 연동 (수동 매핑)
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                기존 가입된 회원과 매핑하여 정상 저장되도록 연결합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            aria-label="닫기"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* 2. 대상 공연자 정보 요약 */}
        <div className="p-4 bg-muted/40 border-b border-border/60 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">연동 대상:</span>
            <span className="font-bold text-foreground truncate text-sm">
              {targetPerformer.name}
            </span>
            {targetPerformer.part && (
              <Badge variant="secondary" className="text-[11px] px-2 py-0.2 shrink-0">
                {targetPerformer.part}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold shrink-0 flex items-center gap-1">
            <AlertTriangle className="size-3" />
            현재 미연동 상태
          </span>
        </div>

        {/* 3. 검색 인풋 */}
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="회원 이름, 이메일, 기수로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9 bg-background text-sm h-9.5 rounded-xl border-border focus-visible:ring-primary/40"
              autoFocus
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground pointer-events-none" />
            )}
          </div>

          {/* 4. 검색 결과 리스트 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-muted-foreground">
                검색된 회원 목록
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {results.length}명
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-border/70 divide-y divide-border/60 bg-background/50">
              {results.length > 0 ? (
                results.map((u) => {
                  const isExactName = u.name === targetPerformer.name;
                  return (
                    <div
                      key={u.id}
                      className={`p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors ${
                        isExactName ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-medium text-xs shrink-0 border border-border">
                          {u.name.slice(0, 1)}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-foreground">
                              {u.name}
                            </span>
                            {u.generation && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 font-mono font-semibold bg-muted/60"
                              >
                                {u.generation}기
                              </Badge>
                            )}
                            {u.part && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 font-medium"
                              >
                                {u.part}
                              </Badge>
                            )}
                            {isExactName && (
                              <span className="text-[10px] text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded">
                                이름 일치
                              </span>
                            )}
                          </div>
                          {u.email && (
                            <span className="text-xs text-muted-foreground truncate mt-0.5">
                              {u.email}
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApply(u)}
                        className="h-8 text-xs font-semibold px-3 shrink-0 gap-1.5 shadow-xs"
                      >
                        <UserCheck className="size-3.5" />
                        연동하기
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
                  {isLoading ? (
                    <p>회원 정보를 조회하는 중입니다...</p>
                  ) : (
                    <>
                      <p className="font-semibold text-foreground">
                        일치하는 회원이 없습니다.
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        다른 이름이나 이메일, 기수로 검색해 보세요.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. 모달 푸터 */}
        <div className="p-4 border-t border-border/70 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>연동 시 해당 부원의 회원 고유 ID(UUID)와 계정이 연결됩니다.</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
