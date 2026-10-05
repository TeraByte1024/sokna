"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Nomination } from "@/lib/nomination";

export function GigNominationList({ gigId, songs, loadError }: {
  gigId: number;
  songs: Nomination[];
  loadError: boolean;
}) {
  return <Card id="gig-nominations" className="scroll-mt-24 overflow-hidden border-border/70 shadow-sm">
    <CardHeader className="border-b border-border/60 bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg">선곡회의 곡 목록</CardTitle>
        <Button asChild variant="outline" size="sm"><Link href={`/gigs/${gigId}/nominations`}>선곡회의 열기 →</Link></Button>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      {loadError ? <p role="alert" className="p-6 text-sm text-destructive">선곡회의 곡 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>
        : songs.length === 0 ? <p className="p-6 text-sm text-muted-foreground">등록된 후보곡이 없습니다.</p>
        : <div className="sm:overflow-x-auto"><table className="w-full table-fixed sm:table-auto text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <th scope="col" className="w-12 px-4 py-3">#</th>
            <th scope="col" className="px-4 py-3">곡 제목 · 아티스트</th>
          </tr></thead>
          <tbody className="divide-y divide-border/60">{songs.map((song, index) => <tr key={song.id} className="cursor-pointer hover:bg-muted/40 focus-within:bg-muted/40" onClick={(event) => {
            if ((event.target as HTMLElement).closest("a") || window.getSelection()?.toString()) return;
            event.currentTarget.querySelector<HTMLAnchorElement>("a")?.click();
          }}>
            <td className="px-4 py-2 text-muted-foreground">{index + 1}</td>
            <td className="px-4 py-2"><Link href={`/gigs/${gigId}/nominations?song=${song.id}`} className="block truncate font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {song.title || "제목 없음"}{song.artist && <span className="font-normal text-muted-foreground"> · {song.artist}</span>}
            </Link></td>
          </tr>)}</tbody>
        </table></div>}
    </CardContent>
  </Card>;
}
