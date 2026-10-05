"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEligibleSessionsForUser, isLocalCustomSession, sortSessionParts, type Nomination, type RecommendedVocal } from "@/lib/nomination";
import { ChevronDown, ChevronUp, Info, MessageSquare, UserRoundX } from "lucide-react";
import { PositiveStatusIcon as CheckCircle2, NegativeStatusIcon as XCircle, UnknownStatusIcon as HelpCircle } from "@/components/ui/status-icons";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { SongResponseDetailsDialog } from "@/components/admin/song-response-details-dialog";
import { ResponsePerformerLegendDialog } from "@/components/admin/response-performer-legend-dialog";

export function PerformerSongResponses({ gigId, performers, songs, loadError = false }: {
  gigId: number;
  performers: RecommendedVocal[];
  songs: Nomination[];
  loadError?: boolean;
}) {
  const [selectedPerformerIds, setSelectedPerformerIds] = useState<number[] | null>(null);
  const [sessionPart, setSessionPart] = useState("");
  const [detailSong, setDetailSong] = useState<Nomination | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const isMobile = useMobileLayout();
  const assignedSessions = performers.flatMap((item) => (item.part || "").split(",").map((part) => part.trim()).filter(Boolean));
  const sortedSessions = sortSessionParts(Array.from(new Set(songs.flatMap((song) => song.requiredParts))));
  const sessionOptions = [
    ...sortedSessions.filter((part) => !isLocalCustomSession(part, assignedSessions)),
    ...sortedSessions.filter((part) => isLocalCustomSession(part, assignedSessions)),
  ];
  const activeSession = sessionOptions.includes(sessionPart) ? sessionPart : sessionOptions[0] || "";

  function eligibleSessions(song: Nomination, item: RecommendedVocal) {
    // Unlinked rows have no account responses; use a temporary identity only for session eligibility.
    const userId = item.userId || `unlinked:${item.id}`;
    const roster = item.userId ? performers : performers.map((p) => p.id === item.id ? { ...p, userId } : p);
    return getEligibleSessionsForUser(item.userId ? song : { ...song, responses: [] }, roster, userId);
  }
  // The selection order determines numbering, never response order or per-song eligibility.
  const sessionPerformers = performers.filter((item) => songs.some((song) => eligibleSessions(song, item).some((entry) => entry.sessionPart === activeSession)));
  const selectedPerformers = selectedPerformerIds === null ? sessionPerformers : selectedPerformerIds.flatMap((id) => {
    const item = sessionPerformers.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const performer = selectedPerformers.length === 1 ? selectedPerformers[0] : undefined;
  const selectionLabel = performer?.name || `${activeSession} 선택 공연자`;
  const selectionOrder = selectedPerformers.map((item) => item.id);
  const orderedPerformers = [...selectedPerformers, ...sessionPerformers.filter((item) => !selectionOrder.includes(item.id))];

  function togglePerformer(id: number) {
    setSelectedPerformerIds(selectionOrder.includes(id) ? selectionOrder.filter((item) => item !== id) : [...selectionOrder, id]);
  }
  function movePerformer(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectionOrder.length) return;
    const next = [...selectionOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setSelectedPerformerIds(next);
  }

  function entriesForSong(song: Nomination, filterSession = activeSession) {
    return selectedPerformers.flatMap((item) => {
      return eligibleSessions(song, item)
        .filter((session) => !filterSession || session.sessionPart === filterSession)
        .map((session) => ({ ...session, performer: item }));
    });
  }
  const answeredSongCount = songs.filter((song) => {
    const entries = entriesForSong(song, "");
    return entries.length > 0 && entries.every(({ performer: item, existingResponse }) => item.userId && (existingResponse?.status === "available" || existingResponse?.status === "unavailable"));
  }).length;
  const visibleSongs = songs.map((song) => ({ song, sessions: entriesForSong(song) }))
    .filter(({ sessions }) => sessions.length > 0);

  return (
    <Card id="gig-song-responses" className="scroll-mt-24 overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="space-y-3 border-b border-border/60 bg-muted/20">
        <CardTitle className="text-lg">공연자별 곡 응답 현황</CardTitle>
        <div className="space-y-3">
        <div className="min-w-0 space-y-2">
          <label htmlFor="song-response-session" className="text-sm font-medium">세션 선택</label>
          <div className="w-full min-w-0 sm:max-w-md">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" id="song-response-session" variant="outline" aria-label="세션 선택" disabled={loadError || sessionOptions.length === 0} className="h-10 w-full min-w-0 justify-between gap-2 border-input bg-background px-3 font-normal">
                  <span className="truncate">{activeSession || "세션 없음"}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]">
                <DropdownMenuRadioGroup value={activeSession} aria-label="세션 선택 목록" onValueChange={(value) => { setSessionPart(value); setSelectedPerformerIds(null); }}>
                  {sessionOptions.map((part) => <DropdownMenuRadioItem key={part} value={part} className="cursor-pointer break-words">{part}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <fieldset disabled={loadError || sessionPerformers.length === 0} className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">응답현황 공연자 순서</legend>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-muted-foreground">선택 {selectedPerformers.length}명 · 선택한 순서대로 번호를 표시합니다.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedPerformerIds(orderedPerformers.map((item) => item.id))} className="rounded px-1 py-1 font-medium text-primary hover:underline disabled:opacity-50">전체 선택</button>
              <button type="button" onClick={() => setSelectedPerformerIds([])} className="rounded px-1 py-1 font-medium text-muted-foreground hover:underline disabled:opacity-50">전체 해제</button>
            </div>
          </div>
          <ol className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain" aria-label="응답현황 공연자 순서 목록">
            {orderedPerformers.map((item) => {
              const index = selectionOrder.indexOf(item.id);
              const selected = index >= 0;
              return <li key={item.id} className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-1.5 ${selected ? "border-primary/20 bg-primary/5" : "border-border/60 bg-background"}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" data-performer-id={item.id} checked={selected} onChange={() => togglePerformer(item.id)} className="size-4 shrink-0 accent-primary" />
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-muted-foreground">{selected ? index + 1 : "—"}</span>
                  <span className="min-w-0 break-words text-sm font-medium">{item.name}{item.generation != null ? ` · ${item.generation}기` : ""}</span>
                </label>
                <div aria-hidden={!selected} className={`flex shrink-0 gap-1 ${selected ? "" : "invisible"}`}>
                  <button type="button" aria-label={`${item.name} 응답 순서 위로`} disabled={!selected || index === 0} onClick={() => movePerformer(index, -1)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"><ChevronUp className="size-4" /></button>
                  <button type="button" aria-label={`${item.name} 응답 순서 아래로`} disabled={!selected || index === selectedPerformers.length - 1} onClick={() => movePerformer(index, 1)} className="flex size-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"><ChevronDown className="size-4" /></button>
                </div>
              </li>;
            })}
          </ol>
          {sessionPerformers.length === 0 && <p className="text-xs text-muted-foreground">해당 세션의 공연자가 없습니다.</p>}
        </fieldset>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loadError ? <p role="alert" className="p-6 text-sm text-destructive">곡별 응답 정보를 불러오지 못했습니다. 새로고침해 주세요.</p>
          : performers.length === 0 ? <p className="p-6 text-sm text-muted-foreground">확정된 공연자가 없습니다.</p>
          : songs.length === 0 ? <p className="p-6 text-sm text-muted-foreground">등록된 후보곡이 없습니다.</p>
          : <>
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {songs.length}곡 중 {answeredSongCount}곡 응답
              {performer && !performer.userId && <span className="block mt-1">계정이 연결되지 않은 공연자이므로 저장된 곡 응답을 확인할 수 없습니다.</span>}
            </p>
            <div className="sm:overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">{selectionLabel}의 곡별 응답 현황과 메모</caption>
                <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th scope="col" className="w-[32%] sm:w-auto px-3 sm:px-4 py-3">곡 제목<span className="hidden sm:inline"> · 아티스트</span></th>
                  <th scope="col" className="sm:w-[212px] px-2 sm:px-4 py-3"><div className="flex flex-wrap items-center gap-1">응답 현황<button type="button" aria-label="응답 번호별 공연자 안내" onClick={() => setShowLegend(true)} className="inline-flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Info className="size-3.5" /></button></div></th>
                  <th scope="col" className="w-12 sm:w-16 px-2 sm:px-4 py-3">메모</th>
                </tr></thead>
                <tbody className="divide-y divide-border/60">
                  {visibleSongs.length === 0 && <tr><td colSpan={3} className="p-6 text-sm text-muted-foreground">{selectedPerformers.length === 0 && sessionPerformers.length > 0 ? "응답을 확인할 공연자를 선택해 주세요." : "선택한 공연자·세션에 해당하는 곡이 없습니다."}</td></tr>}
                  {visibleSongs.map(({ song, sessions }) => {
                  const href = `/gigs/${gigId}/nominations?song=${song.id}`;
                  return <tr key={song.id} className="cursor-pointer transition-colors hover:bg-muted/40 focus-within:bg-muted/40" onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a, button") || window.getSelection()?.toString()) return;
                    if (isMobile) { setDetailSong(song); return; }
                    event.currentTarget.querySelector<HTMLAnchorElement>("a")?.click();
                  }}>
                    <td className="px-3 sm:px-4 py-2 align-top">
                      <button type="button" className="block w-full truncate text-left font-semibold sm:hidden" onClick={() => setDetailSong(song)}>{song.title || "제목 없음"}</button>
                      <Link id={`song-response-link-${song.id}`} href={href} title={[song.title || "제목 없음", song.artist].filter(Boolean).join(" · ")} className="hidden sm:block truncate font-semibold hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{song.title || "제목 없음"}{song.artist && <span className="font-normal text-muted-foreground"> · {song.artist}</span>}</Link>
                    </td>
                    <td className="px-2 sm:px-4 py-2 align-top">
                      <div className="ml-auto grid max-w-[180px] grid-cols-5 gap-1">
                        {selectedPerformers.map((item, index) => {
                          const entry = sessions.find((session) => session.performer.id === item.id);
                          // Keep this person's position even when the song has no eligible session for them.
                          if (!entry) return <span key={item.id} data-performer-number={index + 1} aria-hidden="true" className="h-6" />;
                          const { existingResponse } = entry;
                          const label = `${index + 1}번 · ${item.name} · ${activeSession} · ${!item.userId ? "계정 미연결" : existingResponse?.status === "available" ? "가능" : existingResponse?.status === "unavailable" ? "불가능" : "미응답"}`;
                          const Icon = !item.userId ? UserRoundX : existingResponse?.status === "available" ? CheckCircle2 : existingResponse?.status === "unavailable" ? XCircle : HelpCircle;
                          return <Badge key={item.id} data-performer-number={index + 1} variant="outline" title={label} className={`h-6 w-full min-w-0 justify-center rounded-lg px-0 ${existingResponse?.status === "available" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : existingResponse?.status === "unavailable" ? "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-400" : "border-border bg-muted text-muted-foreground"}`}><Icon className="size-3.5 shrink-0" aria-label={label} /></Badge>;
                        })}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 align-top text-muted-foreground">
                      {sessions.some(({ existingResponse }) => existingResponse?.comment?.trim()) && <button type="button" aria-label={`${song.title} 메모 보기`} className="flex w-fit items-center rounded-xl border border-border/60 bg-muted/60 p-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDetailSong(song)}><MessageSquare className="size-3 shrink-0 text-primary opacity-80" /></button>}
                    </td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </>}
      </CardContent>
      {showLegend && <ResponsePerformerLegendDialog sessionPart={activeSession} performers={selectedPerformers} onClose={() => setShowLegend(false)} />}
      {detailSong && <SongResponseDetailsDialog song={detailSong} entries={entriesForSong(detailSong)} onClose={() => setDetailSong(null)} onOpenSong={() => {
        const id = detailSong.id;
        setDetailSong(null);
        // Close the native modal before link interception opens the unsaved-edit confirmation.
        requestAnimationFrame(() => document.getElementById(`song-response-link-${id}`)?.click());
      }} />}
    </Card>
  );
}
