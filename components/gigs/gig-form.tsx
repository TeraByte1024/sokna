"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createGig, updateGig } from "@/app/gigs/actions";
import { createClient } from "@/lib/supabase/client";
import {
  PerformerSelector,
  type Performer,
  isPerformerLinked,
} from "@/components/performer-selector";
import { SetlistBulkImporter } from "@/components/gigs/setlist-bulk-importer";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  FileSpreadsheet,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";

export interface GigFormData {
  id?: number;
  title: string | null;
  subtitle?: string | null;
  perform_date: string;
  meeting_date: string | null;
  location: string | null;
  poster_url: string | null;
  is_public: boolean | null;
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

const SUGGESTED_SESSIONS = [
  "보컬",
  "기타1",
  "기타2",
  "어쿠스틱기타",
  "일렉기타",
  "베이스",
  "키보드1",
  "키보드2",
  "건반",
  "신디사이저",
  "드럼",
  "코러스",
  "브라스",
  "색소폰",
];

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
  const [customName, setCustomName] = useState("");
  const available = performers.filter((p) => !slot.members.includes(p.name));
  const primary = available.filter((p) => isPerformerInSessionFamily(p, slot.sessionName));
  const others = available.filter((p) => !isPerformerInSessionFamily(p, slot.sessionName));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-dashed border-border/80 transition-colors"
          title={`${slot.sessionName}에 인원 추가`}
        >
          <Plus className="size-3" />
          <span>인원 추가</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 max-h-72 overflow-y-auto">
        {primary.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] font-bold text-primary flex items-center gap-1">
              <span>{slot.sessionName} 담당 부원 ({primary.length})</span>
            </DropdownMenuLabel>
            {primary.map((p) => (
              <DropdownMenuItem
                key={p.email || p.id || p.name}
                onClick={() => onSelectMember(p.name)}
                className="text-xs cursor-pointer flex items-center justify-between py-1.5"
              >
                <span className="font-bold text-foreground">{p.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {p.generation ? `${p.generation}기 · ` : ""}{p.part || "세션"}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {others.length > 0 && (
          <>
            {primary.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground">
              다른 세션 부원 ({others.length})
            </DropdownMenuLabel>
            {others.map((p) => (
              <DropdownMenuItem
                key={p.email || p.id || p.name}
                onClick={() => onSelectMember(p.name)}
                className="text-xs cursor-pointer flex items-center justify-between py-1.5"
              >
                <span className="text-foreground">{p.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {p.generation ? `${p.generation}기 · ` : ""}{p.part || "세션"}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {available.length === 0 && (
          <div className="p-2 text-center text-xs text-muted-foreground">
            선택 가능한 부원이 없습니다.
          </div>
        )}

        <DropdownMenuSeparator />
        <div className="p-1.5 flex gap-1">
          <Input
            type="text"
            placeholder="직접 입력..."
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = customName.trim();
                if (trimmed) {
                  onSelectMember(trimmed);
                  setCustomName("");
                }
              }
            }}
            className="h-7 text-xs bg-background"
          />
          <Button
            type="button"
            size="sm"
            disabled={!customName.trim()}
            onClick={() => {
              const trimmed = customName.trim();
              if (trimmed) {
                onSelectMember(trimmed);
                setCustomName("");
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

function AddSessionDropdown({
  existingSessionNames,
  onAddSession,
}: {
  existingSessionNames: string[];
  onAddSession: (name: string) => void;
}) {
  const [customSession, setCustomSession] = useState("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs font-semibold px-2.5 gap-1 border-primary/30 text-primary hover:bg-primary/10"
        >
          <Plus className="size-3.5" />
          <span>세션 추가</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 max-h-72 overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
          자주 쓰는 세션
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUGGESTED_SESSIONS.map((session) => {
          const isAlready = existingSessionNames.includes(session);
          return (
            <DropdownMenuItem
              key={session}
              disabled={isAlready}
              onClick={() => {
                if (!isAlready) onAddSession(session);
              }}
              className="text-xs cursor-pointer flex items-center justify-between py-1.5"
            >
              <span className={isAlready ? "text-muted-foreground" : "font-medium"}>
                {session}
              </span>
              {isAlready && <Check className="size-3 text-muted-foreground" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="p-1.5 flex gap-1">
          <Input
            type="text"
            placeholder="새 세션명 직접 입력..."
            value={customSession}
            onChange={(e) => setCustomSession(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = customSession.trim();
                if (trimmed) {
                  onAddSession(trimmed);
                  setCustomSession("");
                }
              }
            }}
            className="h-7 text-xs bg-background"
          />
          <Button
            type="button"
            size="sm"
            disabled={!customSession.trim()}
            onClick={() => {
              const trimmed = customSession.trim();
              if (trimmed) {
                onAddSession(trimmed);
                setCustomSession("");
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

function SongSessionManager({
  slots,
  performers,
  onAddSession,
  onRemoveSession,
  onAddMember,
  onRemoveMember,
}: {
  slots: SessionSlot[];
  performers: Performer[];
  onAddSession: (sessionName: string) => void;
  onRemoveSession: (slotIdx: number) => void;
  onAddMember: (slotIdx: number, memberName: string) => void;
  onRemoveMember: (slotIdx: number, memberName: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {slots.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {slots.map((slot, slotIdx) => (
            <div
              key={`${slot.sessionName}-${slotIdx}`}
              className="p-2.5 rounded-xl border border-border/70 bg-background/80 space-y-2 flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground">
                    {slot.sessionName}
                  </span>
                  {slot.members.length > 0 && (
                    <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center font-mono">
                      {slot.members.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveSession(slotIdx)}
                  className="size-5 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                  title={`${slot.sessionName} 세션 삭제`}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1 items-center min-h-[26px]">
                {slot.members.length > 0 ? (
                  slot.members.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary text-primary-foreground shadow-2xs"
                    >
                      <span>{m}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveMember(slotIdx, m)}
                        className="hover:text-primary-foreground/70 transition-colors ml-0.5"
                        title={`${m} 제외`}
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground/60 italic">
                    선택된 인원 없음
                  </span>
                )}
              </div>

              <div className="pt-1 flex items-center justify-end">
                <AddMemberDropdown
                  slot={slot}
                  performers={performers}
                  onSelectMember={(name) => onAddMember(slotIdx, name)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center rounded-xl border border-dashed border-border/70 bg-muted/10 text-muted-foreground text-xs space-y-1">
          <p className="font-medium">지정된 세션이 없습니다.</p>
          <p className="text-[11px] text-muted-foreground/70">
            아래 [세션 추가] 버튼을 눌러 원하는 세션을 추가하세요.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <AddSessionDropdown
          existingSessionNames={slots.map((s) => s.sessionName)}
          onAddSession={onAddSession}
        />
        {slots.length > 0 && (
          <span className="text-[11px] text-muted-foreground font-mono">
            총 {slots.length}개 세션
          </span>
        )}
      </div>
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
  const [performDate, setPerformDate] = useState(
    formatDateForInput(gig?.perform_date) || ""
  );
  const [meetingDate, setMeetingDate] = useState(
    formatDateForInput(gig?.meeting_date) || ""
  );
  const [location, setLocation] = useState(gig?.location ?? "");

  // 2. 포스터 이미지 관련 상태 & 드래그 앤 드롭
  const [posterUrl, setPosterUrl] = useState<string>(gig?.poster_url ?? "");
  const [isUploadingPoster, setIsUploadingPoster] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const posterFileRef = useRef<HTMLInputElement>(null);

  // 3. 공개/비공개 설정 상태
  const [isPublic, setIsPublic] = useState(gig?.is_public ?? true);

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
  const [isImportOpen, setIsImportOpen] = useState(false);

  // 6. 페이지 이탈 방지 확인 팝업 (isDirty 감지 및 이벤트 인터셉트)
  const backLink = mode === "create" ? "/gigs" : `/gigs/${gig?.id}`;

  // 작성 중 변경 사항 여부 (isDirty) 감지
  const isDirty = useMemo(() => {
    if (mode === "create") {
      return Boolean(
        title.trim() ||
        subtitle.trim() ||
        performDate ||
        meetingDate ||
        location.trim() ||
        posterUrl ||
        performers.length > 0 ||
        setlists.length > 0
      );
    } else {
      const initTitle = gig?.title ?? "";
      const initSubtitle = gig?.subtitle ?? "";
      const initPerformDate = formatDateForInput(gig?.perform_date) || "";
      const initMeetingDate = formatDateForInput(gig?.meeting_date) || "";
      const initLocation = gig?.location ?? "";
      const initPosterUrl = gig?.poster_url ?? "";
      const initIsPublic = gig?.is_public ?? true;

      if (
        title !== initTitle ||
        subtitle !== initSubtitle ||
        performDate !== initPerformDate ||
        meetingDate !== initMeetingDate ||
        location !== initLocation ||
        posterUrl !== initPosterUrl ||
        isPublic !== initIsPublic
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
    isPublic,
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
      const nextSlots = [...slots, { sessionName: trimmed, members: [] }];
      next[songIdx] = { ...song, session_members: serializeSessionSlots(nextSlots) };
      return next;
    });
    toast.success(`'${trimmed}' 세션이 추가되었습니다.`);
  };

  const handleRemoveSessionFromSong = (songIdx: number, slotIdx: number) => {
    setSetlists((prev) => {
      const next = [...prev];
      const song = next[songIdx];
      if (!song) return prev;
      const slots = parseSessionSlots(song.session_members);
      const removed = slots[slotIdx]?.sessionName;
      const nextSlots = slots.filter((_, idx) => idx !== slotIdx);
      next[songIdx] = { ...song, session_members: serializeSessionSlots(nextSlots) };
      if (removed) toast.info(`'${removed}' 세션이 삭제되었습니다.`);
      return next;
    });
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
    setNewSongSlots((prev) => [...prev, { sessionName: trimmed, members: [] }]);
    toast.success(`'${trimmed}' 세션이 추가되었습니다.`);
  };

  const handleRemoveSessionFromNewSong = (slotIdx: number) => {
    const removed = newSongSlots[slotIdx]?.sessionName;
    setNewSongSlots((prev) => prev.filter((_, idx) => idx !== slotIdx));
    if (removed) toast.info(`'${removed}' 세션이 삭제되었습니다.`);
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
    setNewSongSlots(DEFAULT_SESSION_SLOTS.map((s) => ({ ...s, members: [] })));
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

  // 셋리스트 일괄 가져오기 (Excel/스프레드시트)
  const handleImportSetlists = async (
    newSongs: SetlistItem[],
    modeImport: "append" | "replace",
    performersToRegister: { name: string; part: string }[]
  ) => {
    if (modeImport === "replace") {
      setSetlists(
        newSongs.map((song, i) => ({
          ...song,
          order_num: i + 1,
        }))
      );
    } else {
      setSetlists((prev) => [
        ...prev,
        ...newSongs.map((song, i) => ({
          ...song,
          order_num: prev.length + i + 1,
        })),
      ]);
    }

    // 신규 연주자 공연자 목록에 스마트 자동 등록
    if (performersToRegister.length > 0) {
      try {
        const namesToQuery = performersToRegister.map((p) => p.name.trim());
        const { data: matchedUsers } = await supabase
          .from("users")
          .select("id, name, email, generation, part")
          .in("name", namesToQuery)
          .neq("status", "rejected");

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

        setPerformers((prev) => {
          const existingNames = new Set(prev.map((p) => p.name.trim()));
          const toAdd: Performer[] = [];

          for (const p of performersToRegister) {
            const trimmedName = p.name.trim();
            if (!existingNames.has(trimmedName)) {
              existingNames.add(trimmedName);
              const matched = userMap.get(trimmedName);

              if (matched && matched.length === 1) {
                const u = matched[0];
                toAdd.push({
                  id: u.id,
                  name: u.name,
                  email: u.email ?? undefined,
                  generation: u.generation ?? null,
                  part: p.part || u.part || "세션",
                });
              } else {
                toAdd.push({
                  name: trimmedName,
                  email: `temp-${Math.random().toString(36).substring(2, 9)}`,
                  part: p.part || "세션",
                });
              }
            }
          }

          return [...prev, ...toAdd];
        });
      } catch (err) {
        console.error("신규 연주자 자동 조회 실패:", err);
      }
    }

    const performerMsg =
      performersToRegister.length > 0
        ? ` (신규 공연자 ${performersToRegister.length}명 자동 추가)`
        : "";
    toast.success(
      `${newSongs.length}곡의 셋리스트가 ${
        modeImport === "replace" ? "교체" : "추가"
      }되었습니다.${performerMsg}`
    );
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
    formData.set("perform_date", performDate);
    formData.set("meeting_date", meetingDate);
    formData.set("location", location);
    formData.set("poster_url", posterUrl);
    formData.set("is_public", isPublic ? "true" : "false");
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
    mode === "create" ? "공연 추가" : "공연 정보 수정";
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
        {mode === "edit" && gig?.id && (
          <span className="text-xs text-muted-foreground font-mono">공연 ID: #{gig.id}</span>
        )}
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {headingTitle}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {headingDescription}
        </p>
      </div>

      <form className="w-full space-y-8" onSubmit={handleFormSubmit}>
        {mode === "edit" && gig?.id && (
          <input type="hidden" name="id" value={gig.id} />
        )}

        {/* 1. 공연 기본 정보 섹션 */}
        <Card className="border-border/70 shadow-sm overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4 border-b border-border/60">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Music className="size-4 text-primary" />
              공연 기본 정보
            </CardTitle>
            <CardDescription className="text-xs">
              공연의 이름, 포스터, 일정 및 장소를 설정합니다.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 sm:p-6 space-y-6">
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
                className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm font-medium"
              />
            </div>

            {/* 공연 부제목 */}
            <div className="space-y-1.5">
              <Label htmlFor="subtitle" className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>공연 부제목</span>
                <span className="text-[11px] font-normal text-muted-foreground">선택 사항</span>
              </Label>
              <Input
                id="subtitle"
                name="subtitle"
                placeholder="예: SOKNA 40th LIVE CONCERT, 봄의 소리를 찾아서 등"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="bg-background border-border text-foreground placeholder:text-muted-foreground text-sm"
              />
            </div>

            {/* 포스터 이미지 (드래그 앤 드롭 지원) */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>포스터 이미지 등록</span>
                <span className="text-[11px] font-normal text-muted-foreground">표준 포스터 규격 (A4/A3, 1:1.41)</span>
              </Label>

              <input
                type="file"
                ref={posterFileRef}
                onChange={handleFileInputChange}
                accept="image/*"
                className="hidden"
              />

              {posterUrl ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border border-border/80 bg-muted/20">
                  <div className="relative w-28 aspect-[1/1.414] rounded-lg overflow-hidden border border-border shadow-xs shrink-0 bg-muted">
                    <img
                      src={posterUrl}
                      alt="포스터 미리보기"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-2 flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      포스터 이미지가 등록되어 있습니다.
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {posterUrl}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => posterFileRef.current?.click()}
                        disabled={isUploadingPoster}
                        className="h-8 text-xs font-medium"
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
                        className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5 mr-1" /> 삭제
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => posterFileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                    isDragging
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
                    <p className="text-xs font-semibold text-foreground">
                      {isUploadingPoster
                        ? "포스터 이미지 업로드 중..."
                        : isDragging
                        ? "여기에 이미지를 놓으세요"
                        : "포스터 이미지를 드래그 앤 드롭하거나 클릭하여 선택하세요"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      PNG, JPG, WEBP 지원 (최대 10MB)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 일정 (공연 일시 & 선곡 회의 일시) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="perform_date" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" />
                  공연 일시 <span className="text-destructive">*</span>
                </Label>
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

              <div className="space-y-1.5">
                <Label htmlFor="meeting_date" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  선곡 회의 일시
                </Label>
                <Input
                  id="meeting_date"
                  name="meeting_date"
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="bg-background border-border text-foreground text-sm"
                />
              </div>
            </div>

            {/* 공연 장소 */}
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

            {/* 공개 여부 설정 */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <Label className="text-xs font-semibold text-foreground">
                공개 여부 설정
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    !isPublic
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border/70 hover:border-border hover:bg-muted/20"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${!isPublic ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Lock className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      비공개 공연
                      {!isPublic && <Check className="size-3 text-primary" />}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      링크를 직접 공유받은 부원에게만 노출됩니다.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    isPublic
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border/70 hover:border-border hover:bg-muted/20"
                  }`}
                >
                  <div className={`p-2 rounded-lg ${isPublic ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    <Globe className="size-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      전체 공개 공연
                      {isPublic && <Check className="size-3 text-primary" />}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      모든 방문자에게 공연 목록과 상세 정보가 공개됩니다.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 6. SETLIST (셋리스트 관리 섹션) */}
            <div className="pt-4 border-t border-border/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ListMusic className="size-4 text-primary" />
                    SETLIST (셋리스트 곡 관리)
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    곡 제목, 아티스트 및 연주자를 지정합니다. 각 항목을 텍스트로 바로 수정하거나 엑셀로 일괄 가져올 수 있습니다.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsImportOpen(!isImportOpen)}
                    className="h-7 text-xs px-2.5 font-semibold gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <FileSpreadsheet className="size-3.5" />
                    엑셀 일괄 가져오기
                  </Button>
                  <span className="text-xs text-muted-foreground font-mono">총 {setlists.length}곡</span>
                </div>
              </div>

              {/* 엑셀 일괄 가져오기 다이얼로그/컴포넌트 */}
              <SetlistBulkImporter
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                existingPerformers={performers}
                onImportSetlists={handleImportSetlists}
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
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <Label className="text-[11px] font-semibold text-muted-foreground">
                            세션 및 연주자 구성:
                          </Label>

                          <SongSessionManager
                            slots={parseSessionSlots(song.session_members)}
                            performers={performers}
                            onAddSession={(name) => handleAddSessionToSong(idx, name)}
                            onRemoveSession={(slotIdx) => handleRemoveSessionFromSong(idx, slotIdx)}
                            onAddMember={(slotIdx, name) => handleAddMemberToSongSession(idx, slotIdx, name)}
                            onRemoveMember={(slotIdx, name) => handleRemoveMemberFromSongSession(idx, slotIdx, name)}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="py-6 text-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-muted-foreground text-xs space-y-1">
                  <p className="font-medium">등록된 곡이 없습니다.</p>
                  <p className="text-muted-foreground/80">
                    아래 입력창에서 곡을 추가하거나 [엑셀 일괄 가져오기]로 등록하세요.
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
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <Label className="text-[11px] font-semibold text-muted-foreground">
                    세션 및 연주자 구성:
                  </Label>

                  <SongSessionManager
                    slots={newSongSlots}
                    performers={performers}
                    onAddSession={handleAddNewSessionToNewSong}
                    onRemoveSession={handleRemoveSessionFromNewSong}
                    onAddMember={handleAddMemberToNewSongSession}
                    onRemoveMember={handleRemoveMemberFromNewSongSession}
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
            </div>

            {/* 7. 공연자 명단 관리 */}
            <div className="pt-2 border-t border-border/60">
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
            </div>
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
