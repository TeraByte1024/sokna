"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createGig, updateGig } from "@/app/gigs/actions";
import { createClient } from "@/lib/supabase/client";
import { getGigVisibility, type GigVisibility } from "@/lib/gig-visibility";
import {
  PerformerSelector,
  type Performer,
  isPerformerLinked,
} from "@/components/performer-selector";
import { GigSpreadsheetImporterDialog } from "@/components/gigs/gig-spreadsheet-importer-dialog";
import { NominationImportDialog, type ImportedSongPayload } from "@/components/gigs/nomination-import-dialog";
import { LeaveConfirmDialog, useUnsavedChangesWarning } from "@/components/ui/leave-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  parseSessionSlots,
  serializeSessionSlots,
  type SessionSlot,
} from "@/lib/gig";
import {
  ArrowLeft,
  Calendar,
  Check,
  Globe,
  ImageIcon,
  ListMusic,
  Loader2,
  Lock,
  MapPin,
  Music,
  Plus,
  Trash2,
  UploadCloud,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  FileSpreadsheet,
  ListPlus,
  AlertTriangle,
  Clock,
  Users,
  X,
} from "lucide-react";
import { SessionOrderDialog } from "./session-order-dialog";
import { toast } from "sonner";
import { cn, parseDateTime, combineDateTime } from "@/lib/utils";

export interface GigFormData {
  id?: number;
  title: string | null;
  subtitle?: string | null;
  advance_ticket_price?: number | null;
  door_ticket_price?: number | null;
  perform_date: string;
  perform_time?: string | null;
  meeting_date: string | null;
  meeting_time?: string | null;
  location: string | null;
  meeting_location?: string | null;
  poster_url: string | null;
  visibility?: GigVisibility | null;
  is_public?: boolean | null;
}

export interface SetlistItem {
  id?: number;
  title: string;
  artist?: string;
  session_members?: string;
  order_num?: number;
}

interface GigFormProps {
  mode?: "create" | "edit";
  gig?: GigFormData;
  initialPerformers?: Performer[];
  initialSetlists?: SetlistItem[];
}

function formatDateForInput(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isPerformerInSessionFamily(p: Performer, sessionName: string): boolean {
  if (!p.part || !sessionName) return false;
  const partLower = p.part.toLowerCase();
  const sessionLower = sessionName.toLowerCase();

  if (partLower.includes(sessionLower) || sessionLower.includes(partLower)) {
    return true;
  }

  const cleanSession = sessionLower.replace(/\s*\d+$/, "").trim();
  if (cleanSession && (partLower.includes(cleanSession) || cleanSession.includes(partLower))) {
    return true;
  }

  const isKeySession = /건반|키보드|피아노|신디/i.test(sessionLower);
  const isKeyPerformer = /건반|키보드|피아노|신디/i.test(partLower);
  if (isKeySession && isKeyPerformer) return true;

  const isGuitarSession = /기타|guitar|일렉|어쿠스틱/i.test(sessionLower);
  const isGuitarPerformer = /기타|guitar|일렉|어쿠스틱/i.test(partLower);
  if (isGuitarSession && isGuitarPerformer) return true;

  return false;
}

const DEFAULT_SESSION_SLOTS: SessionSlot[] = [
  { sessionName: "보컬", members: [] },
  { sessionName: "기타", members: [] },
  { sessionName: "베이스", members: [] },
  { sessionName: "키보드", members: [] },
  { sessionName: "드럼", members: [] },
];

function AddMemberDropdown({
  slot,
  performers,
  onSelectMember,
}: {
  slot: SessionSlot;
  performers: Performer[];
  onSelectMember: (name: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  // 외부 클릭 시 팝업 닫기 및 접기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsExpanded(false);
        setQuery("");
      }
    }
    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExpanded]);

  // 확장 시 input 자동 포커스
  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  const available = useMemo(() => {
    return performers.filter((p) => !slot.members.includes(p.name));
  }, [performers, slot.members]);

  const { primary, others } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? available.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.part && p.part.toLowerCase().includes(q))
      )
      : available;

    const prim = filtered.filter((p) => isPerformerInSessionFamily(p, slot.sessionName));
    const oth = filtered.filter((p) => !isPerformerInSessionFamily(p, slot.sessionName));
    return { primary: prim, others: oth };
  }, [available, query, slot.sessionName]);

  const handleSelect = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSelectMember(trimmed);
    setQuery("");
    setIsOpen(false);
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const trimmed = query.trim();
      if (!trimmed) {
        setIsExpanded(false);
        setIsOpen(false);
        return;
      }
      const exactMatch = available.find(
        (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (exactMatch) {
        handleSelect(exactMatch.name);
      } else {
        handleSelect(trimmed);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setIsExpanded(false);
      setQuery("");
    }
  };

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsExpanded(true);
          setIsOpen(true);
        }}
        className="size-5 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/70 transition-colors"
        title={`${slot.sessionName}에 인원 추가`}
      >
        <Plus className="size-3" />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <div className="relative inline-flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="인원 입력..."
          className="h-6 w-20 sm:w-24 pl-1.5 pr-4 rounded text-[11px] bg-background hover:bg-background focus:bg-background border border-primary/70 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all placeholder:text-muted-foreground/60 placeholder:text-[10px]"
          title={`${slot.sessionName}에 인원 직접 입력 또는 검색`}
        />
        <button
          type="button"
          onClick={() => {
            setIsExpanded(false);
            setIsOpen(false);
            setQuery("");
          }}
          className="absolute right-1 size-3.5 inline-flex items-center justify-center text-muted-foreground/50 hover:text-foreground"
          title="취소"
        >
          <X className="size-2.5" />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1.5 w-56 max-h-64 overflow-y-auto rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-xl z-50 p-1.5 text-xs animate-in fade-in-50 zoom-in-95 duration-100"
          onMouseDown={(e) => e.preventDefault()}
        >
          {primary.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-bold text-primary flex items-center justify-between">
                <span>
                  {slot.sessionName} ({primary.length})
                </span>
              </div>
              {primary.map((p) => (
                <button
                  key={p.email || p.id || p.name}
                  type="button"
                  onClick={() => handleSelect(p.name)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center justify-between transition-colors group"
                >
                  <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                    {p.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {p.generation ? `${p.generation}기 · ` : ""}{p.part || "세션"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {primary.length > 0 && others.length > 0 && (
            <div className="my-1 border-t border-border/50" />
          )}

          {others.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground flex items-center justify-between">
                <span>다른 세션 ({others.length})</span>
              </div>
              {others.map((p) => (
                <button
                  key={p.email || p.id || p.name}
                  type="button"
                  onClick={() => handleSelect(p.name)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center justify-between transition-colors"
                >
                  <span className="text-foreground">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {p.generation ? `${p.generation}기 · ` : ""}{p.part || "세션"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {primary.length === 0 && others.length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground space-y-1">
              {query.trim() ? (
                <>
                  <p className="font-medium text-foreground">'{query.trim()}' 일치 부원 없음</p>
                  <p className="text-[10px] text-primary font-semibold">
                    Enter를 누르면 이름 그대로 직접 추가됩니다
                  </p>
                </>
              ) : (
                <p>선택 가능한 부원이 없습니다.</p>
              )}
            </div>
          )}

          {query.trim() &&
            !available.some(
              (p) => p.name.trim().toLowerCase() === query.trim().toLowerCase()
            ) && (
              <div className="mt-1 pt-1 border-t border-border/50 px-0.5">
                <button
                  type="button"
                  onClick={() => handleSelect(query.trim())}
                  className="w-full text-left px-2 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold flex items-center justify-between transition-colors"
                >
                  <span>'{query.trim()}' 직접 추가</span>
                  <span className="text-[10px] font-normal text-muted-foreground font-mono">Enter ↵</span>
                </button>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function AddSessionDropdown({
  existingSessionNames = [],
  onAddSession,
}: {
  existingSessionNames?: string[];
  onAddSession: (name: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 접기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        setSessionName("");
      }
    }
    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExpanded]);

  // 확장 시 자동 포커스
  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  const handleSubmit = () => {
    const trimmed = sessionName.trim();
    if (!trimmed) return;
    if (existingSessionNames.includes(trimmed)) {
      toast.info(`'${trimmed}' 세션이 이미 존재합니다.`);
      return;
    }
    onAddSession(trimmed);
    setSessionName("");
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsExpanded(false);
      setSessionName("");
    }
  };

  if (!isExpanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="h-7 text-xs font-semibold px-2.5 gap-1 border-primary/30 text-primary hover:bg-primary/10 shadow-2xs"
      >
        <Plus className="size-3.5" />
        <span>세션 추가</span>
      </Button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="inline-flex items-center gap-1 bg-background border border-primary/40 rounded-lg p-0.5 shadow-2xs animate-in fade-in-50 zoom-in-95 duration-100"
    >
      <Input
        ref={inputRef}
        type="text"
        placeholder="세션명 입력..."
        value={sessionName}
        onChange={(e) => setSessionName(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-6 w-24 sm:w-28 text-xs bg-transparent border-none px-2 focus-visible:ring-0 shadow-none"
      />
      <Button
        type="button"
        size="sm"
        disabled={!sessionName.trim()}
        onClick={handleSubmit}
        className="h-6 px-2 text-xs font-medium"
      >
        추가
      </Button>
      <button
        type="button"
        onClick={() => {
          setIsExpanded(false);
          setSessionName("");
        }}
        className="size-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded transition-colors"
        title="취소"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function SongSessionManager({
  songTitle,
  slots,
  performers,
  onAddSession,
  onRemoveSession,
  onAddMember,
  onRemoveMember,
  onMoveSession,
}: {
  songTitle?: string;
  slots: SessionSlot[];
  performers: Performer[];
  onAddSession: (sessionName: string) => void;
  onRemoveSession: (slotIdx: number) => void;
  onAddMember: (slotIdx: number, memberName: string) => void;
  onRemoveMember: (slotIdx: number, memberName: string) => void;
  onMoveSession?: (slotIdx: number, direction: "prev" | "next") => void;
}) {
  const [sessionToDelete, setSessionToDelete] = useState<{
    slotIdx: number;
    sessionName: string;
    members: string[];
  } | null>(null);

  useEffect(() => {
    if (!sessionToDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSessionToDelete(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sessionToDelete]);

  if (slots.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <span>지정된 세션이 없습니다.</span>
        <AddSessionDropdown
          existingSessionNames={[]}
          onAddSession={onAddSession}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {slots.map((slot, slotIdx) => {
        const hasMembers = slot.members.length > 0;
        return (
          <div
            key={`${slot.sessionName}-${slotIdx}`}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-colors shadow-2xs",
              hasMembers
                ? "bg-background/90 border-border/80"
                : "bg-muted/20 border-dashed border-border/70 text-muted-foreground"
            )}
          >
            {/* 세션 순서 좌우 이동 버튼 (세션이 2개 이상일 때) */}
            {onMoveSession && slots.length > 1 && (
              <div className="inline-flex items-center -ml-1 mr-0.5 border-r border-border/40 pr-0.5 gap-0.25 shrink-0">
                <button
                  type="button"
                  disabled={slotIdx === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveSession(slotIdx, "prev");
                  }}
                  className="size-4 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
                  title="세션 앞으로 이동"
                >
                  <ChevronLeft className="size-3" />
                </button>
                <button
                  type="button"
                  disabled={slotIdx === slots.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveSession(slotIdx, "next");
                  }}
                  className="size-4 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
                  title="세션 뒤로 이동"
                >
                  <ChevronRight className="size-3" />
                </button>
              </div>
            )}

            {/* 세션명 */}
            <span
              className={cn(
                "font-bold text-[11px] shrink-0 tracking-tight",
                hasMembers ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {slot.sessionName}
            </span>

            {/* 연주자 뱃지들 */}
            {hasMembers && (
              <div className="inline-flex items-center gap-1 flex-wrap">
                {slot.members.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-primary/15 text-primary border border-primary/20 shadow-2xs"
                  >
                    <span>{m}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveMember(slotIdx, m)}
                      className="hover:text-destructive transition-colors ml-0.5"
                      title={`${m} 제외`}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 인원 추가 드롭다운 */}
            <AddMemberDropdown
              slot={slot}
              performers={performers}
              onSelectMember={(name) => onAddMember(slotIdx, name)}
            />

            {/* 세션 삭제 버튼 (클릭 시 확인 팝업/다이얼로그) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSessionToDelete({
                  slotIdx,
                  sessionName: slot.sessionName,
                  members: slot.members,
                });
              }}
              className="size-4 inline-flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
              title={`${slot.sessionName} 세션 삭제`}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        );
      })}

      <AddSessionDropdown
        existingSessionNames={slots.map((s) => s.sessionName)}
        onAddSession={onAddSession}
      />

      {/* 세션 삭제 확인 다이얼로그 */}
      {sessionToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSessionToDelete(null)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive shrink-0">
                <Trash2 className="size-5" />
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <h4 className="text-sm font-bold text-foreground">
                  '{sessionToDelete.sessionName}' 세션 삭제
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {sessionToDelete.members.length > 0 ? (
                    <>
                      {songTitle?.trim() ? `'${songTitle.trim()}'` : "해당 곡"}에서 '{sessionToDelete.sessionName}' 세션을 삭제하시겠습니까?<br />
                      <span className="text-destructive font-medium">
                        배정된 인원({sessionToDelete.members.join(", ")})도 함께 제거됩니다.
                      </span>
                    </>
                  ) : (
                    `${songTitle?.trim() ? `'${songTitle.trim()}'` : "해당 곡"}에서 '${sessionToDelete.sessionName}' 세션을 삭제하시겠습니까?`
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSessionToDelete(null)}
                className="h-8 text-xs"
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  onRemoveSession(sessionToDelete.slotIdx);
                  setSessionToDelete(null);
                }}
                className="h-8 text-xs font-semibold"
              >
                삭제하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GigForm({
  mode = "edit",
  gig,
  initialPerformers = [],
  initialSetlists = [],
}: GigFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 1. 공연 기본 정보 상태
  const [title, setTitle] = useState(gig?.title ?? "");
  const [subtitle, setSubtitle] = useState(gig?.subtitle ?? "");
  const [advanceTicketPrice, setAdvanceTicketPrice] = useState<number | null>(
    gig?.advance_ticket_price ?? null
  );
  const [doorTicketPrice, setDoorTicketPrice] = useState<number | null>(
    gig?.door_ticket_price ?? null
  );
  const initialPerform = parseDateTime(gig?.perform_date);
  const [performDate, setPerformDate] = useState(initialPerform.date || gig?.perform_date || "");
  const [performTime, setPerformTime] = useState(gig?.perform_time ?? initialPerform.time);

  const initialMeeting = parseDateTime(gig?.meeting_date);
  const [meetingDate, setMeetingDate] = useState(initialMeeting.date || gig?.meeting_date || "");
  const [meetingTime, setMeetingTime] = useState(gig?.meeting_time ?? initialMeeting.time);

  const [location, setLocation] = useState(gig?.location ?? "");
  const [meetingLocation, setMeetingLocation] = useState(gig?.meeting_location ?? "");

  // 2. 포스터 이미지 관련 상태 & 드래그 앤 드롭
  const [posterUrl, setPosterUrl] = useState<string>(gig?.poster_url ?? "");
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const posterFileRef = useRef<HTMLInputElement>(null);

  // 3. 공개 범위 설정 상태
  const [visibility, setVisibility] = useState<GigVisibility>(getGigVisibility(gig ?? {}));

  // 4. 참여자 관련 상태
  const [performers, setPerformers] = useState<Performer[]>(initialPerformers);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Performer[]>([]);

  // 5. 셋리스트 관련 상태
  const [setlists, setSetlists] = useState<SetlistItem[]>(initialSetlists);
  const [newSongTitle, setNewSongTitle] = useState("");
  const [newSongArtist, setNewSongArtist] = useState("");
  const [newSongSlots, setNewSongSlots] = useState<SessionSlot[]>(
    DEFAULT_SESSION_SLOTS.map((s) => ({ ...s, members: [] }))
  );
  const [isSpreadsheetImportOpen, setIsSpreadsheetImportOpen] = useState(false);
  const [isNominationImportOpen, setIsNominationImportOpen] = useState(false);
  const [isSessionOrderOpen, setIsSessionOrderOpen] = useState(false);
  const [globalSessionOrder, setGlobalSessionOrder] = useState<string[] | null>(null);

  // 6. 페이지 이탈 방지 확인 팝업 (isDirty 감지 및 이벤트 인터셉트)
  const backLink = mode === "create" ? "/gigs" : `/gigs/${gig?.id}`;

  // 작성 중 변경 사항 여부 (isDirty) 감지
  const isDirty = useMemo(() => {
    if (mode === "create") {
      return Boolean(
        title.trim() ||
        subtitle.trim() ||
        performDate ||
        performTime ||
        meetingDate ||
        meetingTime ||
        location.trim() ||
        meetingLocation.trim() ||
        posterUrl ||
        performers.length > 0 ||
        setlists.length > 0 ||
        visibility !== "members"
      );
    } else {
      const initTitle = gig?.title ?? "";
      const initSubtitle = gig?.subtitle ?? "";
      const initPerform = parseDateTime(gig?.perform_date);
      const initPerformDate = initPerform.date || gig?.perform_date || "";
      const initPerformTime = gig?.perform_time ?? initPerform.time;
      const initMeeting = parseDateTime(gig?.meeting_date);
      const initMeetingDate = initMeeting.date || gig?.meeting_date || "";
      const initMeetingTime = gig?.meeting_time ?? initMeeting.time;
      const initLocation = gig?.location ?? "";
      const initMeetingLocation = gig?.meeting_location ?? "";
      const initPosterUrl = gig?.poster_url ?? "";
      const initVisibility = getGigVisibility(gig ?? {});

      if (
        title !== initTitle ||
        subtitle !== initSubtitle ||
        performDate !== initPerformDate ||
        performTime !== initPerformTime ||
        meetingDate !== initMeetingDate ||
        meetingTime !== initMeetingTime ||
        location !== initLocation ||
        meetingLocation !== initMeetingLocation ||
        posterUrl !== initPosterUrl ||
        visibility !== initVisibility
      ) {
        return true;
      }

      if (performers.length !== initialPerformers.length) return true;
      const performersChanged = performers.some((p, i) => {
        const init = initialPerformers[i];
        if (!init) return true;
        return (
          p.id !== init.id ||
          p.name !== init.name ||
          p.part !== init.part ||
          p.photo_url !== init.photo_url
        );
      });
      if (performersChanged) return true;

      if (setlists.length !== initialSetlists.length) return true;
      const setlistsChanged = setlists.some((s, i) => {
        const init = initialSetlists[i];
        if (!init) return true;
        return (
          s.title !== init.title ||
          s.artist !== init.artist ||
          s.session_members !== init.session_members
        );
      });
      if (setlistsChanged) return true;

      return false;
    }
  }, [
    mode,
    title,
    subtitle,
    performDate,
    meetingDate,
    location,
    posterUrl,
    visibility,
    performers,
    setlists,
    gig,
    initialPerformers,
    initialSetlists,
  ]);

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    handleInterceptedNavigation,
    markSubmitting,
  } = useUnsavedChangesWarning({ isDirty, defaultBackLink: backLink });

  // 포스터 이미지 업로드 공통 함수
  const uploadPosterFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일(PNG, JPG, WEBP 등)만 등록 가능합니다.");
      return;
    }

    setIsUploadingPoster(true);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `posters/${fileName}`;

      const { error } = await supabase.storage
        .from("gigs")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (error) throw error;

      const { data } = supabase.storage.from("gigs").getPublicUrl(filePath);
      setPosterUrl(data.publicUrl);
      toast.success("포스터 이미지가 등록되었습니다.", { id: "poster-upload" });
    } catch (err) {
      console.error("포스터 업로드 실패:", err);
      toast.error("포스터 이미지 업로드에 실패했습니다.");
    } finally {
      setIsUploadingPoster(false);
      if (posterFileRef.current) posterFileRef.current.value = "";
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadPosterFile(file);
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadPosterFile(file);
    }
  };

  // 유저 검색 로직 (Debounce)
  useEffect(() => {
    const fetchUsers = async () => {
      if (search.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("id, name, email, generation, part")
        .neq("status", "rejected")
        .or(`name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(8);

      if (data) {
        setSearchResults(
          data.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email ?? undefined,
            generation: u.generation,
            part: u.part || "세션",
          }))
        );
      }
    };

    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [search, supabase]);

  // 명단 관리 핸들러
  const addPerformer = (p: Performer) => {
    if (!performers.find((item) => (item.id && item.id === p.id) || (item.email && item.email === p.email))) {
      setPerformers([
        ...performers,
        {
          ...p,
          part: p.part || "세션",
        },
      ]);
    }
    setSearch("");
    setSearchResults([]);
  };

  const removePerformer = (email: string) => {
    setPerformers(performers.filter((p) => p.email !== email));
  };

  const handleBulkAdd = (namesOrPerformers: string[] | Performer[]) => {
    if (namesOrPerformers.length === 0) return;

    if (typeof namesOrPerformers[0] === "string") {
      const newPerformers: Performer[] = (namesOrPerformers as string[]).map((name) => ({
        name,
        email: `temp-${Math.random().toString(36).substring(2, 9)}`,
        part: "세션",
      }));
      setPerformers((prev) => [...prev, ...newPerformers]);
      toast.success(`${newPerformers.length}명의 공연자가 명단에 추가되었습니다.`);
    } else {
      setPerformers((prev) => [...prev, ...(namesOrPerformers as Performer[])]);
    }
  };

  const handleUpdatePart = (index: number, newPart: string) => {
    setPerformers((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], part: newPart };
      }
      return next;
    });
  };

  const handleUpdatePhoto = (index: number, photoUrl: string) => {
    setPerformers((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], photo_url: photoUrl };
      }
      return next;
    });
  };

  // 수동 매핑 핸들러 (연동 완료 및 셋리스트 내 이름 동기화)
  const handleMapPerformer = (index: number, mappedUser: Performer, oldName: string) => {
    setPerformers((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = mappedUser;
      }
      return next;
    });

    // 셋리스트에 포함된 기존 이름을 새 이름으로 일괄 치환 (JSON 세션 슬롯 구조 지원)
    if (oldName && oldName !== mappedUser.name) {
      setSetlists((prev) =>
        prev.map((song) => {
          if (!song.session_members) return song;
          const slots = parseSessionSlots(song.session_members);
          let changed = false;
          slots.forEach((s) => {
            s.members = s.members.map((m) => {
              if (m === oldName) {
                changed = true;
                return mappedUser.name;
              }
              return m;
            });
          });
          if (changed) {
            return { ...song, session_members: serializeSessionSlots(slots) };
          }
          return song;
        })
      );
    }

    toast.success(`'${oldName}'님이 '${mappedUser.name}' 회원 계정과 연동되었습니다.`);
  };

  // 셋리스트 특정 곡 세션 관리 핸들러
  const handleAddSessionToSong = (songIdx: number, sessionName: string) => {
    const trimmed = sessionName.trim();
    if (!trimmed) return;
    setSetlists((prev) => {
      const next = [...prev];
      const song = next[songIdx];
      if (!song) return prev;
      const slots = parseSessionSlots(song.session_members);
      if (slots.some((s) => s.sessionName === trimmed)) {
        toast.info(`'${trimmed}' 세션이 이미 존재합니다.`);
        return prev;
      }
      let nextSlots = [...slots, { sessionName: trimmed, members: [] }];
      if (globalSessionOrder && globalSessionOrder.length > 0) {
        const orderMap = new Map(globalSessionOrder.map((name, i) => [name, i]));
        nextSlots.sort((a, b) => {
          const ordA = orderMap.has(a.sessionName) ? orderMap.get(a.sessionName)! : 999;
          const ordB = orderMap.has(b.sessionName) ? orderMap.get(b.sessionName)! : 999;
          return ordA - ordB;
        });
      }
      next[songIdx] = { ...song, session_members: serializeSessionSlots(nextSlots) };
      return next;
    });
  };

  const handleMoveSessionInSong = (songIdx: number, slotIdx: number, direction: "prev" | "next") => {
    setSetlists((prev) => {
      const next = [...prev];
      const song = next[songIdx];
      if (!song) return prev;
      const slots = parseSessionSlots(song.session_members);
      const targetIdx = direction === "prev" ? slotIdx - 1 : slotIdx + 1;
      if (targetIdx < 0 || targetIdx >= slots.length) return prev;

      const nextSlots = [...slots];
      const temp = nextSlots[slotIdx];
      nextSlots[slotIdx] = nextSlots[targetIdx];
      nextSlots[targetIdx] = temp;

      next[songIdx] = { ...song, session_members: serializeSessionSlots(nextSlots) };
      return next;
    });
  };

  const handleRemoveSessionFromSong = (songIdx: number, slotIdx: number) => {
    const currentSong = setlists[songIdx];
    const removed = currentSong?.session_members
      ? parseSessionSlots(currentSong.session_members)[slotIdx]?.sessionName
      : undefined;

    setSetlists((prev) => {
      const next = [...prev];
      const song = next[songIdx];
      if (!song) return prev;
      const slots = parseSessionSlots(song.session_members);
      const nextSlots = slots.filter((_, idx) => idx !== slotIdx);
      next[songIdx] = { ...song, session_members: serializeSessionSlots(nextSlots) };
      return next;
    });

    if (removed) toast.info(`'${removed}' 세션이 삭제되었습니다.`);
  };

  const handleAddMemberToSongSession = (songIdx: number, slotIdx: number, memberName: string) => {
    const trimmed = memberName.trim();
    if (!trimmed) return;
    setSetlists((prev) => {
      const next = [...prev];
      const song = next[songIdx];
      if (!song) return prev;
      const slots = parseSessionSlots(song.session_members);
      const slot = slots[slotIdx];
      if (!slot) return prev;
      if (!slot.members.includes(trimmed)) {
        slot.members.push(trimmed);
      }
      next[songIdx] = { ...song, session_members: serializeSessionSlots(slots) };
      return next;
    });
  };

  const handleRemoveMemberFromSongSession = (songIdx: number, slotIdx: number, memberName: string) => {
    setSetlists((prev) => {
      const next = [...prev];
      const song = next[songIdx];
      if (!song) return prev;
      const slots = parseSessionSlots(song.session_members);
      const slot = slots[slotIdx];
      if (!slot) return prev;
      slot.members = slot.members.filter((m) => m !== memberName);
      next[songIdx] = { ...song, session_members: serializeSessionSlots(slots) };
      return next;
    });
  };

  // 새 곡 추가 폼 전용 세션 관리 핸들러
  const handleAddNewSessionToNewSong = (sessionName: string) => {
    const trimmed = sessionName.trim();
    if (!trimmed) return;
    if (newSongSlots.some((s) => s.sessionName === trimmed)) {
      toast.info(`'${trimmed}' 세션이 이미 존재합니다.`);
      return;
    }
    setNewSongSlots((prev) => {
      let nextSlots = [...prev, { sessionName: trimmed, members: [] }];
      if (globalSessionOrder && globalSessionOrder.length > 0) {
        const orderMap = new Map(globalSessionOrder.map((name, i) => [name, i]));
        nextSlots.sort((a, b) => {
          const ordA = orderMap.has(a.sessionName) ? orderMap.get(a.sessionName)! : 999;
          const ordB = orderMap.has(b.sessionName) ? orderMap.get(b.sessionName)! : 999;
          return ordA - ordB;
        });
      }
      return nextSlots;
    });
  };

  const handleMoveSessionInNewSong = (slotIdx: number, direction: "prev" | "next") => {
    setNewSongSlots((prev) => {
      const targetIdx = direction === "prev" ? slotIdx - 1 : slotIdx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const temp = next[slotIdx];
      next[slotIdx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleRemoveSessionFromNewSong = (slotIdx: number) => {
    const removed = newSongSlots[slotIdx]?.sessionName;
    setNewSongSlots((prev) => prev.filter((_, idx) => idx !== slotIdx));
    if (removed) toast.info(`'${removed}' 세션이 삭제되었습니다.`);
  };

  // 셋리스트 전체 세션 표시 순서 일괄 적용 핸들러
  const handleApplyGlobalSessionOrder = (orderedSessionNames: string[]) => {
    setGlobalSessionOrder(orderedSessionNames);
    const orderMap = new Map(orderedSessionNames.map((name, i) => [name, i]));

    setSetlists((prev) =>
      prev.map((song) => {
        if (!song.session_members) return song;
        const slots = parseSessionSlots(song.session_members);
        if (slots.length <= 1) return song;

        const sorted = [...slots].sort((a, b) => {
          const ordA = orderMap.has(a.sessionName) ? orderMap.get(a.sessionName)! : 999;
          const ordB = orderMap.has(b.sessionName) ? orderMap.get(b.sessionName)! : 999;
          return ordA - ordB;
        });

        return {
          ...song,
          session_members: serializeSessionSlots(sorted),
        };
      })
    );

    setNewSongSlots((prev) => {
      if (prev.length <= 1) return prev;
      return [...prev].sort((a, b) => {
        const ordA = orderMap.has(a.sessionName) ? orderMap.get(a.sessionName)! : 999;
        const ordB = orderMap.has(b.sessionName) ? orderMap.get(b.sessionName)! : 999;
        return ordA - ordB;
      });
    });

    toast.success("셋리스트의 세션 표시 순서가 일괄 적용되었습니다.");
  };

  const handleAddMemberToNewSongSession = (slotIdx: number, memberName: string) => {
    const trimmed = memberName.trim();
    if (!trimmed) return;
    setNewSongSlots((prev) => {
      const next = [...prev];
      const slot = next[slotIdx];
      if (!slot) return prev;
      if (!slot.members.includes(trimmed)) {
        slot.members = [...slot.members, trimmed];
      }
      return next;
    });
  };

  const handleRemoveMemberFromNewSongSession = (slotIdx: number, memberName: string) => {
    setNewSongSlots((prev) => {
      const next = [...prev];
      const slot = next[slotIdx];
      if (!slot) return prev;
      slot.members = slot.members.filter((m) => m !== memberName);
      return next;
    });
  };

  // 셋리스트 곡 추가 핸들러
  const handleAddSong = () => {
    if (!newSongTitle.trim()) {
      toast.error("곡 제목을 입력해 주세요.");
      return;
    }

    const newSong: SetlistItem = {
      title: newSongTitle.trim(),
      artist: newSongArtist.trim(),
      session_members: serializeSessionSlots(newSongSlots),
      order_num: setlists.length + 1,
    };

    setSetlists([...setlists, newSong]);
    setNewSongTitle("");
    setNewSongArtist("");
    const baseSlots = DEFAULT_SESSION_SLOTS.map((s) => ({ ...s, members: [] }));
    if (globalSessionOrder && globalSessionOrder.length > 0) {
      const orderMap = new Map(globalSessionOrder.map((name, i) => [name, i]));
      baseSlots.sort((a, b) => {
        const ordA = orderMap.has(a.sessionName) ? orderMap.get(a.sessionName)! : 999;
        const ordB = orderMap.has(b.sessionName) ? orderMap.get(b.sessionName)! : 999;
        return ordA - ordB;
      });
    }
    setNewSongSlots(baseSlots);
    toast.success("셋리스트에 곡이 추가되었습니다.");
  };

  const handleRemoveSong = (index: number) => {
    setSetlists(setlists.filter((_, idx) => idx !== index));
  };

  const handleMoveSong = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === setlists.length - 1) return;

    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const next = [...setlists];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setSetlists(next);
  };

  // 기존 셋리스트 항목의 개별 필드 인라인 수정
  const handleUpdateSongField = (
    index: number,
    field: keyof SetlistItem,
    value: string
  ) => {
    setSetlists((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  // 선곡회의 후보곡 가져오기 (텍스트 복사 및 자동 추가)
  const handleImportNominations = (songs: ImportedSongPayload[]) => {
    setSetlists((prev) => [
      ...prev,
      ...songs.map((song, i) => ({
        title: song.title,
        artist: song.artist,
        session_members: song.session_members,
        order_num: prev.length + i + 1,
      })),
    ]);
  };

  // 엑셀 표 일괄 불러오기 (덮어쓰기 적용)
  const handleApplySpreadsheetImport = (result: {
    performers: Performer[];
    setlists?: SetlistItem[];
    mode: "performers_only" | "full";
  }) => {
    // 1. 공연자 목록 덮어쓰기
    setPerformers(result.performers);

    // 2. 세션 분배 결과표일 경우 셋리스트도 덮어쓰기
    if (result.mode === "full" && result.setlists) {
      setSetlists(
        result.setlists.map((song, i) => ({
          ...song,
          order_num: i + 1,
        }))
      );
    }
  };

  // 폼 제출 핸들러 (중복 실행 방지 및 토스트 단일화)
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;

    setMessage(null);
    setPending(true);

    const formData = new FormData();
    if (mode === "edit" && gig?.id) {
      formData.set("id", String(gig.id));
    }
    formData.set("title", title);
    formData.set("subtitle", subtitle);
    formData.set(
      "advance_ticket_price",
      advanceTicketPrice != null ? String(advanceTicketPrice) : ""
    );
    formData.set(
      "door_ticket_price",
      doorTicketPrice != null ? String(doorTicketPrice) : ""
    );
    formData.set("perform_date", performDate || "");
    formData.set("perform_time", performTime || "");
    formData.set("meeting_date", meetingDate || "");
    formData.set("meeting_time", meetingTime || "");
    formData.set("location", location);
    formData.set("meeting_location", meetingLocation);
    formData.set("poster_url", posterUrl);
    formData.set("visibility", visibility);
    formData.set("performers", JSON.stringify(performers));
    formData.set("setlists", JSON.stringify(setlists));

    try {
      const result =
        mode === "create"
          ? await createGig(formData)
          : await updateGig(formData);

      if (result.ok) {
        markSubmitting();
        const successMsg =
          mode === "create"
            ? "공연이 성공적으로 등록되었습니다."
            : "공연 정보가 성공적으로 수정되었습니다.";
        toast.success(successMsg, { id: "gig-form-toast" });

        const targetUrl =
          mode === "create"
            ? result.gigId
              ? `/gigs/${result.gigId}`
              : "/gigs"
            : `/gigs/${gig?.id}`;

        window.location.href = targetUrl;
        return;
      }
      setMessage(result.error);
      toast.error(result.error || "저장 실패", { id: "gig-form-toast" });
    } catch {
      const errMsg = "공연 정보 저장 중 오류가 발생했습니다.";
      setMessage(errMsg);
      toast.error(errMsg, { id: "gig-form-toast" });
    } finally {
      setPending(false);
    }
  };

  const backLabel =
    mode === "create" ? "공연 목록으로" : "공연 상세로 돌아가기";
  const headingTitle =
    mode === "create" ? "공연 추가" : "공연 수정하기";
  const headingDescription =
    mode === "create"
      ? "새로운 공연 일정과 참여할 공연자 명단을 등록합니다."
      : "공연의 기본 정보, 일정, 포스터, 셋리스트 및 공연자 명단을 수정합니다.";
  const submitButtonText =
    mode === "create" ? "공연 등록" : "수정 완료";

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* 상단 네비게이션 */}
      <div className="flex items-center justify-between">
        <Link
          href={backLink}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
          {backLabel}
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {headingTitle}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {headingDescription}
        </p>
      </div>

      <form
        className="w-full space-y-8"
        onSubmit={handleFormSubmit}
        onKeyDown={(e) => {
          // 페이지 단위에서 input 내 Enter 키 입력으로 인한 자동 폼 저장(제출) 방지
          // (UI 컴포넌트 단위의 자체 Enter 핸들링은 정상 동작 유지)
          if (e.key === "Enter") {
            const target = e.target as HTMLElement | null;
            if (target && target.tagName === "INPUT") {
              const input = target as HTMLInputElement;
              if (!["button", "submit", "reset"].includes(input.type)) {
                e.preventDefault();
              }
            }
          }
        }}
      >
        {mode === "edit" && gig?.id && (
          <input type="hidden" name="id" value={gig.id} />
        )}

        {/* 1. 기본 정보 섹션 */}
        <Card className="border-border/70 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4 border-b border-border/60">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Music className="size-4 text-primary" />
              기본 정보
            </CardTitle>
            <CardDescription className="text-xs">
              공연의 이름, 포스터, 일정 및 장소를 설정합니다.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 sm:p-6 space-y-6">
            {/* 포스터 & 제목 / 부제목 레이아웃 (포스터 | 제목, 포스터 | 부제목) */}
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* 포스터 이미지 (좌측) */}
              <div className="w-full max-w-[240px] md:max-w-none md:w-48 lg:w-52 shrink-0 mx-auto md:mx-0 space-y-2">
                <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>포스터 이미지</span>
                </Label>

                <input
                  type="file"
                  ref={posterFileRef}
                  onChange={handleFileInputChange}
                  accept="image/*"
                  className="hidden"
                />

                {posterUrl ? (
                  <div className="space-y-2">
                    <div className="relative w-full aspect-[1/1.414] rounded-xl overflow-hidden border border-border/80 shadow-xs bg-muted group">
                      <img
                        src={posterUrl}
                        alt="포스터 미리보기"
                        className="w-full h-full object-cover"
                      />
                      {isUploadingPoster && (
                        <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex items-center justify-center">
                          <Loader2 className="size-6 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => posterFileRef.current?.click()}
                        disabled={isUploadingPoster}
                        className="h-8 text-xs font-medium flex-1"
                      >
                        {isUploadingPoster ? (
                          <Loader2 className="size-3.5 animate-spin mr-1.5" />
                        ) : (
                          <UploadCloud className="size-3.5 mr-1.5" />
                        )}
                        이미지 변경
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPosterUrl("")}
                        disabled={isUploadingPoster}
                        className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2.5"
                        title="포스터 삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => posterFileRef.current?.click()}
                    className={`w-full aspect-[1/1.414] border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${isDragging
                      ? "border-primary bg-primary/10 scale-[0.99]"
                      : "border-border/80 hover:border-primary/50 hover:bg-muted/30 bg-muted/10"
                      }`}
                  >
                    <div className="p-3 rounded-full bg-muted text-muted-foreground">
                      {isUploadingPoster ? (
                        <Loader2 className="size-5 animate-spin text-primary" />
                      ) : (
                        <ImageIcon className="size-5" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground leading-snug">
                        {isUploadingPoster
                          ? "업로드 중..."
                          : isDragging
                            ? "여기에 놓으세요"
                            : "포스터 이미지 등록"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        클릭 또는 드래그 앤 드롭
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        PNG, JPG, WEBP (최대 10MB)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 제목 & 부제목 영역 (우측: 포스터 | 제목, 포스터 | 부제목) */}
              <div className="flex-1 w-full space-y-4 pt-0.5">
                {/* 공연 제목 */}
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-semibold text-foreground">
                    공연 제목 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    required
                    placeholder="예: 2026 봄 정기공연"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm font-medium h-10"
                  />
                </div>

                {/* 공연 부제목 */}
                <div className="space-y-1.5">
                  <Label htmlFor="subtitle" className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>공연 부제목</span>
                  </Label>
                  <Input
                    id="subtitle"
                    name="subtitle"
                    placeholder="예: SOKNA 40th LIVE CONCERT, 봄의 소리를 찾아서 등"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm h-10"
                  />
                </div>

                {/* 티켓 예매 가격 (사전예매 / 현장예매) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                  {/* 사전예매 가격 */}
                  <div className="space-y-1.5">
                    <Label htmlFor="advance_ticket_price" className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>사전예매 가격</span>
                      <span className="text-[10px] text-muted-foreground font-normal">KRW (원)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="advance_ticket_price"
                        name="advance_ticket_price"
                        type="text"
                        inputMode="numeric"
                        placeholder="예: 5,000"
                        value={
                          advanceTicketPrice != null
                            ? advanceTicketPrice.toLocaleString("ko-KR")
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          setAdvanceTicketPrice(raw ? parseInt(raw, 10) : null);
                        }}
                        className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm h-10 pr-8 font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
                        원
                      </span>
                    </div>
                  </div>

                  {/* 현장예매 가격 */}
                  <div className="space-y-1.5">
                    <Label htmlFor="door_ticket_price" className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>현장예매 가격</span>
                      <span className="text-[10px] text-muted-foreground font-normal">KRW (원)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="door_ticket_price"
                        name="door_ticket_price"
                        type="text"
                        inputMode="numeric"
                        placeholder="예: 7,000"
                        value={
                          doorTicketPrice != null
                            ? doorTicketPrice.toLocaleString("ko-KR")
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          setDoorTicketPrice(raw ? parseInt(raw, 10) : null);
                        }}
                        className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm h-10 pr-8 font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
                        원
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 일정 (공연 일시 & 선곡회의 일시) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 공연 일시 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-primary" />
                    공연 일시 <span className="text-destructive">*</span>
                  </span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Input
                      id="perform_date"
                      name="perform_date"
                      type="date"
                      required
                      value={performDate}
                      onChange={(e) => setPerformDate(e.target.value)}
                      className="bg-background border-border text-foreground text-sm font-medium"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      id="perform_time"
                      name="perform_time"
                      type="time"
                      value={performTime}
                      onChange={(e) => setPerformTime(e.target.value)}
                      placeholder="18:00"
                      className="bg-background border-border text-foreground text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* 선곡회의 일시 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-indigo-500" />
                    선곡회의 일시
                  </span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Input
                      id="meeting_date"
                      name="meeting_date"
                      type="date"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className="bg-background border-border text-foreground text-sm"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      id="meeting_time"
                      name="meeting_time"
                      type="time"
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                      placeholder="19:00"
                      className="bg-background border-border text-foreground text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 장소 (공연 장소 & 선곡회의 장소) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="location" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" />
                  공연 장소
                </Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="예: 홍대 클럽 프리버드 / 학생회관 소극장"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meeting_location" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-indigo-500" />
                  선곡회의 장소
                </Label>
                <Input
                  id="meeting_location"
                  name="meeting_location"
                  placeholder="예: 동아리방, 학생회관 301호 등"
                  value={meetingLocation}
                  onChange={(e) => setMeetingLocation(e.target.value)}
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>
            </div>

            {/* 공개 범위 */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <Label className="text-xs font-semibold text-foreground">
                공개 범위
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setVisibility("private")}
                  aria-pressed={visibility === "private"}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${visibility === "private"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border/70 hover:border-border hover:bg-muted/20"
                    }`}
                >
                  <div className={`p-2 rounded-lg ${visibility === "private" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Lock className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      비공개
                      {visibility === "private" && <Check className="size-3 text-primary" />}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      관리자만 확인할 수 있습니다.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility("members")}
                  aria-pressed={visibility === "members"}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${visibility === "members"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border/70 hover:border-border hover:bg-muted/20"
                    }`}
                >
                  <div className={`p-2 rounded-lg ${visibility === "members" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Users className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      회원 공개
                      {visibility === "members" && <Check className="size-3 text-primary" />}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      로그인한 모든 회원에게 공연 목록과 상세 정보가 공개됩니다.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility("public")}
                  aria-pressed={visibility === "public"}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${visibility === "public"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border/70 hover:border-border hover:bg-muted/20"
                    }`}
                >
                  <div className={`p-2 rounded-lg ${visibility === "public" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Globe className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      전체 공개
                      {visibility === "public" && <Check className="size-3 text-primary" />}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      모든 방문자에게 공연 목록과 상세 정보가 공개됩니다.
                    </p>
                  </div>
                </button>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* 2. SETLIST 관리 섹션 */}
        <Card className="border-border/70 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ListMusic className="size-4 text-primary" />
                  SETLIST 관리 (총 {setlists.length}곡)
                </CardTitle>
                <CardDescription className="text-xs">
                  공연에서 연주할 곡 목록과 세션 연주자를 구성합니다.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSessionOrderOpen(true)}
                  className="h-7 text-xs px-2.5 font-semibold gap-1.5 border-border hover:bg-muted text-foreground shadow-2xs"
                  title="셋리스트에 표시될 세션 종류의 순서를 편집합니다"
                >
                  <SlidersHorizontal className="size-3.5 text-primary" />
                  세션 순서 설정
                </Button>
                {gig?.id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsNominationImportOpen(true)}
                    className="h-7 text-xs px-2.5 font-semibold gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <ListPlus className="size-3.5" />
                    선곡회의 곡 가져오기
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSpreadsheetImportOpen(true)}
                  className="h-7 text-xs px-2.5 font-semibold gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <FileSpreadsheet className="size-3.5" />
                  엑셀에서 공연자 / 셋리스트 불러오기
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6 space-y-4">
            {/* 선곡회의 후보곡 가져오기 다이얼로그 */}
            {gig?.id && (
              <NominationImportDialog
                isOpen={isNominationImportOpen}
                onClose={() => setIsNominationImportOpen(false)}
                gigId={gig.id}
                onImportSongs={handleImportNominations}
              />
            )}

              {/* 엑셀 일괄 가져오기 다이얼로그 */}
              <GigSpreadsheetImporterDialog
                isOpen={isSpreadsheetImportOpen}
                onClose={() => setIsSpreadsheetImportOpen(false)}
                existingPerformersCount={performers.length}
                existingSetlistsCount={setlists.length}
                onApplyImport={handleApplySpreadsheetImport}
              />

              {/* 세션 표시 순서 일괄 설정 다이얼로그 */}
              <SessionOrderDialog
                isOpen={isSessionOrderOpen}
                onClose={() => setIsSessionOrderOpen(false)}
                songs={setlists}
                newSongSlots={newSongSlots}
                initialOrder={globalSessionOrder ?? undefined}
                onApplyOrder={handleApplyGlobalSessionOrder}
              />

              {/* 셋리스트 목록 */}
              {setlists.length > 0 ? (
                <div className="space-y-3">
                  {setlists.map((song, idx) => (
                    <div
                      key={song.id ?? `song-${idx}`}
                      className="p-3.5 rounded-xl border border-border/80 bg-background/80 space-y-3 shadow-xs hover:border-primary/40 transition-colors"
                    >
                      {/* 1행: 곡 번호 | 곡 제목 Input | 아티스트 Input | 상하 이동 및 삭제 액션 버튼 */}
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center size-6 rounded-md bg-muted text-muted-foreground font-mono text-xs font-bold shrink-0">
                          #{idx + 1}
                        </span>

                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            type="text"
                            value={song.title}
                            onChange={(e) => handleUpdateSongField(idx, "title", e.target.value)}
                            placeholder="곡 제목 입력"
                            className="h-8 text-xs font-semibold bg-background border-border"
                          />
                          <Input
                            type="text"
                            value={song.artist || ""}
                            onChange={(e) => handleUpdateSongField(idx, "artist", e.target.value)}
                            placeholder="아티스트명 (선택)"
                            className="h-8 text-xs bg-background border-border text-muted-foreground"
                          />
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={idx === 0}
                            onClick={() => handleMoveSong(idx, "up")}
                            className="size-7 text-muted-foreground hover:text-foreground"
                            title="위로 이동"
                          >
                            <ChevronUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={idx === setlists.length - 1}
                            onClick={() => handleMoveSong(idx, "down")}
                            className="size-7 text-muted-foreground hover:text-foreground"
                            title="아래로 이동"
                          >
                            <ChevronDown className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveSong(idx)}
                            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="곡 삭제"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* 세션별 연주자 관리 (가변 세션 추가/삭제 및 인원 배정) */}
                      <div className="pt-2 border-t border-border/50">

                        <SongSessionManager
                          songTitle={song.title}
                          slots={parseSessionSlots(song.session_members)}
                          performers={performers}
                          onAddSession={(name) => handleAddSessionToSong(idx, name)}
                          onRemoveSession={(slotIdx) => handleRemoveSessionFromSong(idx, slotIdx)}
                          onAddMember={(slotIdx, name) => handleAddMemberToSongSession(idx, slotIdx, name)}
                          onRemoveMember={(slotIdx, name) => handleRemoveMemberFromSongSession(idx, slotIdx, name)}
                          onMoveSession={(slotIdx, direction) => handleMoveSessionInSong(idx, slotIdx, direction)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-muted-foreground text-xs space-y-1">
                  <p className="font-medium">등록된 곡이 없습니다.</p>
                  <p className="text-muted-foreground/80">
                    아래 입력창에서 곡을 추가하거나 [엑셀에서 공연자 / 셋리스트 불러오기]로 등록하세요.
                  </p>
                </div>
              )}

              {/* 새 곡 추가 인라인 폼 */}
              <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-3">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Plus className="size-3.5 text-primary" /> 새 곡 직접 추가
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    type="text"
                    placeholder="곡 제목 입력 *"
                    value={newSongTitle}
                    onChange={(e) => setNewSongTitle(e.target.value)}
                    className="h-8 text-xs bg-background border-border"
                  />
                  <Input
                    type="text"
                    placeholder="아티스트명 (선택)"
                    value={newSongArtist}
                    onChange={(e) => setNewSongArtist(e.target.value)}
                    className="h-8 text-xs bg-background border-border"
                  />
                </div>

                {/* 새 곡 세션 관리 */}
                <div className="pt-1.5 border-t border-border/50">

                  <SongSessionManager
                    songTitle={newSongTitle}
                    slots={newSongSlots}
                    performers={performers}
                    onAddSession={handleAddNewSessionToNewSong}
                    onRemoveSession={handleRemoveSessionFromNewSong}
                    onAddMember={handleAddMemberToNewSongSession}
                    onRemoveMember={handleRemoveMemberFromNewSongSession}
                    onMoveSession={handleMoveSessionInNewSong}
                  />
                </div>

                <div className="flex items-center justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddSong}
                    disabled={!newSongTitle.trim()}
                    className="h-8 text-xs font-semibold px-4 gap-1 shadow-xs"
                  >
                    <Plus className="size-3.5" /> 곡 추가하기
                  </Button>
                </div>
              </div>
          </CardContent>
        </Card>

        {/* 3. 공연자 관리 섹션 */}
        <Card className="border-border/70 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  공연자 관리 (총 {performers.length}명)
                </CardTitle>
                <CardDescription className="text-xs">
                  공연에 참여하는 부원 명단을 등록하고 세션을 지정합니다.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6">
            <PerformerSelector
              search={search}
              setSearch={setSearch}
              results={searchResults}
              selected={performers}
              onAdd={addPerformer}
              onRemove={removePerformer}
              onBulkAdd={handleBulkAdd}
              onMapPerformer={handleMapPerformer}
              onUpdatePart={handleUpdatePart}
              onUpdatePhoto={handleUpdatePhoto}
            />
          </CardContent>
        </Card>

        {/* 에러 메시지 알림 */}
        {message && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
            <p className="text-sm text-destructive font-medium">{message}</p>
          </div>
        )}

        {/* 8. 하단 액션 버튼 */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => handleInterceptedNavigation(backLink)}
            className="w-full sm:w-auto font-medium"
          >
            취소
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className="w-full sm:w-auto font-semibold shadow-md shadow-primary/20 min-w-[140px]"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" /> 저장 중…
              </>
            ) : (
              <>
                <Check className="size-4 mr-1.5" /> {submitButtonText}
              </>
            )}
          </Button>
        </div>
      </form>

      {/* 페이지 이탈 확인 모달 */}
      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
      />
    </div>
  );
}
