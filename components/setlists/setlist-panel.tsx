"use client";

import { useCallback, useId, useRef, useState, useTransition, useEffect } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Loader2, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PartChip } from "@/components/setlists/part-chip";
import {
  type Setlist,
  type SetlistLink,
  type PartConfigs,
  mapSetlistRow,
} from "@/lib/setlist";
import { addSetlist, deleteSetlist } from "@/app/gigs/[id]/setlists/actions";

type LinkRow = SetlistLink & { _key: string };

export function SetlistPanel() {
  const params = useParams();
  const gigId = params.id as string;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const supabase = createClient();

  const [isPending, startTransition] = useTransition();
  const [songs, setSongs] = useState<Setlist[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [description, setDescription] = useState("");
  const [linkRows, setLinkRows] = useState<LinkRow[]>([{ youtubeUrl: "", _key: "init" }]);

  // 핵심: 세션 구성을 string 배열로 관리
  const [parts, setParts] = useState<string[]>([]);
  const [isAddingPart, setIsAddingPart] = useState(false);

  const handleIncrement = (partName: string) => {
    setParts((prev) => [...prev, partName]);
  };

  // 1명 제거 핸들러 (마지막 인덱스부터 지워서 자연스럽게 처리)
  const handleDecrement = (partName: string) => {
    setParts((prev) => {
      const index = prev.lastIndexOf(partName);
      if (index > -1) {
        const next = [...prev];
        next.splice(index, 1);
        return next;
      }
      return prev;
    });
  };

  const handleAddPart = (newPart: string) => {
    setParts((prev) => [...prev, newPart]);
    setIsAddingPart(false);
  };
  const groupedParts = parts.reduce((acc, curr) => {
    acc[curr] = (acc[curr] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 기본 세션 구성 정의
  const DEFAULT_SESSIONS = ["보컬", "기타", "베이스", "드럼", "건반"];

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const [authRes, dbRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from("setlists").select("*").eq("gig_id", gigId).order("created_at", { ascending: false })
        ]);
        if (authRes.data.user) setUserId(authRes.data.user.id);
        if (dbRes.data) setSongs(dbRes.data.map(mapSetlistRow));
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [gigId, supabase]);

  const resetForm = useCallback(() => {
    setTitle("");
    setArtist("");
    setDescription("");
    setParts([...DEFAULT_SESSIONS]);
    setIsAddingPart(false);
    setLinkRows([{ youtubeUrl: "", _key: crypto.randomUUID() }]);
  }, []);

  const openDialog = () => { resetForm(); dialogRef.current?.showModal(); };
  const closeDialog = () => dialogRef.current?.close();

  const handleDeletePart = (partName: string) => {
    // 해당 파트 명을 가진 항목 중 하나만 제거
    setParts((prev) => {
      const index = prev.indexOf(partName);
      if (index > -1) {
        const next = [...prev];
        next.splice(index, 1);
        return next;
      }
      return prev;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // parts 배열을 다시 기존의 PartConfigs(객체) 형태로 변환하여 전송
    const partConfig: PartConfigs = parts.reduce((acc, curr) => {
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
    }, {} as any);

    const links = linkRows
      .map(({ youtubeUrl, segmentNote }) => ({
        youtubeUrl: youtubeUrl.trim(),
        segmentNote: segmentNote?.trim() || undefined,
      }))
      .filter((l) => l.youtubeUrl.length > 0);

    startTransition(async () => {
      try {
        await addSetlist(gigId, {
          title: title.trim(),
          artist: artist.trim(),
          description: description.trim(),
          part_config: partConfig,
          references: links,
        });
        closeDialog();
        window.location.reload();
      } catch (err) {
        alert("저장에 실패했습니다.");
      }
    });
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">선곡회의</h1>
          <p className="text-muted-foreground mt-2 text-sm">공연하고 싶은 곡을 추천해 주세요.</p>
        </div>
        <Button onClick={openDialog} className="shrink-0">
          <Plus className="size-4 mr-2" /> 후보곡 추가
        </Button>
      </div>

      <section className="grid gap-4">
        {songs.length === 0 ? (
          <Card className="bg-muted/20 border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              아직 추천된 곡이 없습니다.
            </CardContent>
          </Card>
        ) : (
          songs.map((song) => (
            <SetlistCard key={song.id} song={song} onDelete={(id) => { }} canDelete={song.createdBy === userId} />
          ))
        )}
      </section>

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-1rem),32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
          <div className="border-b px-6 py-4 font-semibold">후보곡 등록</div>

          <div className="overflow-y-auto px-6 py-4 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>곡 제목</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>아티스트</Label>
                <Input value={artist} onChange={(e) => setArtist(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">세션 구성</Label>
              <div className="flex flex-wrap gap-2 items-center border rounded-lg p-3 min-h-[3rem] bg-muted/5 shadow-sm transition-all">
                {Object.entries(groupedParts).map(([name, count]) => (
                  <PartChip
                    key={name}
                    label={name}
                    count={count}
                    onIncrement={() => handleIncrement(name)}
                    onDecrement={() => handleDecrement(name)}
                  />
                ))}

                {isAddingPart ? (
                  <PartChip
                    isEditing
                    onConfirm={handleAddPart}
                    onCancel={() => setIsAddingPart(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingPart(true)}
                    className={`
                        flex items-center justify-center h-8 px-4 rounded-full 
                        border border-dashed border-muted-foreground/40 
                        text-muted-foreground hover:text-primary hover:border-primary hover:bg-primary/5 
                        transition-all active:scale-95 group
                      `}
                    title="새 파트 추가"
                  >
                    <Plus className="size-3.5 mr-1.5 group-hover:scale-110 transition-transform" />
                    <span className="text-[13px] font-bold">파트 추가</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>설명 / 어필</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="ghost" onClick={closeDialog}>취소</Button>
            <Button type="submit" disabled={isPending}>등록</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

// SetlistCard는 이전 답변의 구조를 유지하되 스타일만 통일시켰습니다.
function SetlistCard({ song, onDelete, canDelete }: { song: Setlist; onDelete: (id: string) => void; canDelete: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">{song.title}</CardTitle>
          <CardDescription>{song.artist}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          {Object.entries(song.partConfigs).map(([label, count]) => (
            count > 0 && (
              <div key={label} className="bg-muted px-2 py-1 rounded text-[11px] font-medium">
                {label} <span className="text-primary ml-0.5">{count}</span>
              </div>
            )
          ))}
        </div>
        {song.description && <p className="text-muted-foreground leading-relaxed">{song.description}</p>}
      </CardContent>
    </Card>
  );
}
