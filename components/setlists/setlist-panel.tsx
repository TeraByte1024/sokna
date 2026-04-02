"use client";

import { useCallback, useId, useRef, useState, useTransition, useEffect } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Loader2, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client"; // 클라이언트용 supabase 설정 확인 필요
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type Setlist,
  type SetlistLink,
  type PartConfigs,
  SESSION_COUNT_MAX,
  SESSION_SLOTS,
  defaultPartConfigs,
  mapSetlistRow,
} from "@/lib/setlist";
import { addSetlist, deleteSetlist } from "@/app/gigs/[id]/setlists/actions";

type LinkRow = SetlistLink & { _key: string };

export function SetlistPanel() {
  const params = useParams();
  const gigId = params.id as string;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const supabase = createClient();
  
  const [isPending, startTransition] = useTransition();
  const [songs, setSongs] = useState<Setlist[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form States
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [description, setDescription] = useState("");
  const [partConfigs, setPartConfigs] = useState<PartConfigs>(defaultPartConfigs);
  const [linkRows, setLinkRows] = useState<LinkRow[]>([{ youtubeUrl: "", _key: "init" }]);

  // 초기 데이터 로드 (Setlists & Auth)
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const [authRes, dbRes] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from("setlists").select("*").eq("gig_id", gigId).order("created_at", { ascending: false })
        ]);

        if (authRes.data.user) setUserId(authRes.data.user.id);
        if (dbRes.data) {
          setSongs(dbRes.data.map(mapSetlistRow));
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
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
    setPartConfigs(defaultPartConfigs());
    setLinkRows([{ youtubeUrl: "", _key: crypto.randomUUID() }]);
  }, []);

  const openDialog = () => { resetForm(); dialogRef.current?.showModal(); };
  const closeDialog = () => dialogRef.current?.close();

  const handleSessionChange = (key: keyof PartConfigs, value: number) => {
    setPartConfigs((prev) => ({
      ...prev,
      [key]: Math.min(SESSION_COUNT_MAX, Math.max(0, Math.floor(value))),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          part_config: partConfigs,
          references: links,
        });
        // 등록 후 데이터 재호출 대신 상태를 직접 업데이트하거나 
        // revalidatePath가 동작하므로 브라우저가 자동 갱신되지 않는다면 window.location.reload() 또는 fetch 재호출
        closeDialog();
        window.location.reload(); 
      } catch (err) {
        alert("저장에 실패했습니다.");
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 후보곡을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteSetlist(gigId, id);
        setSongs(prev => prev.filter(s => s.id !== id));
      } catch (err) {
        alert("삭제에 실패했습니다.");
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
              아직 추천된 곡이 없습니다. 첫 번째 후보곡을 등록해보세요!
            </CardContent>
          </Card>
        ) : (
          songs.map((song) => (
            <SetlistCard 
              key={song.id} 
              song={song} 
              onDelete={handleDelete} 
              canDelete={song.createdBy === userId} // 본인 확인
            />
          ))
        )}
      </section>

      {/* --- 등록 다이얼로그 --- */}
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-1rem),32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        onClose={resetForm}
      >
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">후보곡 등록</h2>
          </div>

          <div className="overflow-y-auto px-6 py-4 space-y-5">
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
              <div className="flex gap-2 overflow-x-auto pb-2">
                {SESSION_SLOTS.map(({ key, label }) => (
                  <div key={key} className="flex flex-col gap-1.5 items-center shrink-0">
                    <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
                    <Input
                      type="number"
                      className="w-12 h-9 text-center px-1"
                      value={partConfigs[key]}
                      onChange={(e) => handleSessionChange(key, parseInt(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>설명 / 어필</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/10">
            <Button type="button" variant="ghost" onClick={closeDialog}>취소</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 등록
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function SetlistCard({ song, onDelete, canDelete }: { song: Setlist; onDelete: (id: string) => void; canDelete: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">{song.title}</CardTitle>
          <CardDescription>{song.artist}</CardDescription>
        </div>
        {canDelete && (
          <Button variant="ghost" size="icon" className="hover:text-destructive" onClick={() => onDelete(song.id)}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground">
          {SESSION_SLOTS.map(({ key, label }) => {
            const count = song.partConfigs[key];
            if (count <= 0) return null;
            return (
              <span key={key} className="flex items-center gap-1 text-xs">
                <span className="font-semibold text-foreground">{label}</span> {count}
              </span>
            );
          })}
        </div>
        {song.description && <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{song.description}</p>}
        <div className="flex flex-wrap gap-2">
          {song.links.map((link, idx) => (
            <a
              key={idx}
              href={link.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 text-[11px] font-medium hover:bg-muted transition-colors"
            >
              <ExternalLink className="size-3" />
              {link.segmentNote || "영상"}
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}