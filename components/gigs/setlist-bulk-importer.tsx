"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  Check,
  X,
  Sparkles,
  Users,
  Info,
} from "lucide-react";
import type { SetlistItem } from "@/components/gigs/gig-edit-form";
import type { Performer } from "@/components/performer-selector";
import {
  parseSessionSlots,
  serializeSessionSlots,
  type SessionSlot,
} from "@/lib/gig";

export interface ParsedSetlistSong {
  title: string;
  artist: string;
  session_members: string;
  performers: { name: string; part: string }[];
}

interface SetlistBulkImporterProps {
  existingPerformers: Performer[];
  onImportSetlists: (
    newSongs: SetlistItem[],
    mode: "append" | "replace",
    performersToRegister: { name: string; part: string }[]
  ) => void;
  isOpen: boolean;
  onClose: () => void;
}

function isValidPerformerName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.length > 10) return false;
  // 단체 지칭어 또는 제외 대상 단어 필터링
  if (/하세요|전원|다같이|모두|미정|없음|게스트|객원/i.test(trimmed)) return false;
  return true;
}

function normalizePartName(rawHeader: string): string {
  const clean = rawHeader.trim();
  // 뒷자리 숫자 제거 (예: 기타1 -> 기타, 키보드2 -> 키보드)
  const withoutNum = clean.replace(/\s*\d+$/, "").trim();
  if (/^건반|키보드|피아노|신디/i.test(withoutNum)) return "키보드";
  if (/^일렉기타|어쿠스틱기타|기타/i.test(withoutNum)) return "기타";
  if (/^베이스/i.test(withoutNum)) return "베이스";
  if (/^드럼/i.test(withoutNum)) return "드럼";
  if (/^보컬/i.test(withoutNum)) return "보컬";
  return withoutNum || "세션";
}

function splitRowCells(rowStr: string, delimiter: string): string[] {
  if (delimiter === "\t") {
    return rowStr.split("\t").map((c) => c.trim().replace(/^["']|["']$/g, ""));
  }
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ""));
  return result;
}

export function parseSetlistTableText(
  rawText: string
): { songs: ParsedSetlistSong[]; detectedHeaders: string[] } {
  if (!rawText.trim()) {
    return { songs: [], detectedHeaders: [] };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { songs: [], detectedHeaders: [] };
  }

  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : "\t";
  const rows = lines.map((line) => splitRowCells(line, delimiter));

  const firstRow = rows[0];
  const headerKeywords = [
    "곡", "곡명", "곡제목", "곡 제목", "노래", "제목", "title", "song",
    "아티스트", "가수", "원곡자", "원곡", "artist", "singer",
    "보컬", "vocal", "기타", "guitar", "일렉", "어쿠스틱",
    "베이스", "bass", "키보드", "건반", "피아노", "신디", "keyboard",
    "드럼", "drum", "세션", "멤버", "연주자", "파트", "no", "번호", "순서"
  ];

  const isHeader =
    firstRow.some((c) => {
      const t = c.toLowerCase();
      return t === "곡" || t === "곡명" || t === "제목" || t === "곡제목" || t === "title";
    }) ||
    firstRow.filter((c) => headerKeywords.some((kw) => c.toLowerCase().includes(kw))).length >= 2;

  let headers: string[] = [];
  let dataRows: string[][] = [];

  if (isHeader) {
    headers = firstRow;
    dataRows = rows.slice(1);
  } else {
    // 헤더가 없는 경우 기본 순서 (곡, 아티스트, 보컬, 기타1, 기타2, 베이스, 키보드1, 키보드2, 드럼)
    headers = ["곡", "아티스트", "보컬", "기타1", "기타2", "베이스", "키보드1", "키보드2", "드럼"];
    dataRows = rows;
  }

  interface ColumnMeta {
    index: number;
    kind: "title" | "artist" | "session" | "ignore";
    partName: string;
  }

  const columnMetas: ColumnMeta[] = headers.map((rawHeader, idx) => {
    const clean = rawHeader.trim();
    const lower = clean.toLowerCase();

    if (
      lower === "곡" ||
      lower === "곡명" ||
      lower === "곡제목" ||
      lower === "곡 제목" ||
      lower === "노래" ||
      lower === "제목" ||
      lower === "title" ||
      lower === "song"
    ) {
      return { index: idx, kind: "title", partName: "" };
    }

    if (
      lower === "아티스트" ||
      lower === "가수" ||
      lower === "원곡자" ||
      lower === "원곡" ||
      lower === "artist" ||
      lower === "singer"
    ) {
      return { index: idx, kind: "artist", partName: "" };
    }

    if (
      lower === "no" ||
      lower === "no." ||
      lower === "#" ||
      lower === "순서" ||
      lower === "번호" ||
      lower === "순번"
    ) {
      return { index: idx, kind: "ignore", partName: "" };
    }

    return { index: idx, kind: "session", partName: normalizePartName(clean) };
  });

  let titleColIndex = columnMetas.findIndex((c) => c.kind === "title");
  if (titleColIndex === -1) {
    titleColIndex = 0;
    columnMetas[0] = { index: 0, kind: "title", partName: "" };
  }

  const artistColIndex = columnMetas.findIndex((c) => c.kind === "artist");
  const parsedSongs: ParsedSetlistSong[] = [];

  for (const row of dataRows) {
    if (row.length === 0 || row.every((c) => !c.trim())) continue;

    const title = row[titleColIndex]?.trim() || "";
    if (!title) continue;

    const artist = artistColIndex !== -1 ? row[artistColIndex]?.trim() || "" : "";
    const songPerformers: { name: string; part: string }[] = [];
    const songSlots: SessionSlot[] = [];

    columnMetas.forEach((colMeta) => {
      if (colMeta.kind !== "session") return;
      const cellValue = row[colMeta.index]?.trim();
      if (
        !cellValue ||
        cellValue === "-" ||
        cellValue === "/" ||
        cellValue === "없음" ||
        cellValue === "미정"
      ) {
        return;
      }

      // 한 셀에 쉼표나 슬래시로 여러 명이 들어간 경우 분리
      const memberNames = cellValue
        .split(/[,/&]/)
        .map((n) => n.trim())
        .filter(Boolean);

      if (memberNames.length > 0) {
        const slotSessionName = headers[colMeta.index]?.trim() || colMeta.partName;
        songSlots.push({
          sessionName: slotSessionName,
          members: memberNames,
        });

        memberNames.forEach((name) => {
          if (isValidPerformerName(name)) {
            songPerformers.push({ name, part: colMeta.partName });
          }
        });
      }
    });

    parsedSongs.push({
      title,
      artist,
      session_members: serializeSessionSlots(songSlots),
      performers: songPerformers,
    });
  }

  return { songs: parsedSongs, detectedHeaders: headers };
}

export function SetlistBulkImporter({
  existingPerformers,
  onImportSetlists,
  isOpen,
  onClose,
}: SetlistBulkImporterProps) {
  const [pasteText, setPasteText] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [autoAddPerformers, setAutoAddPerformers] = useState(true);

  const { songs: parsedSongs, detectedHeaders } = useMemo(() => {
    return parseSetlistTableText(pasteText);
  }, [pasteText]);

  // 파싱된 연주자 중 기존 공연자 명단에 없는 신규 연주자 추출
  const newPerformers = useMemo(() => {
    const existingNames = new Set(existingPerformers.map((p) => p.name.trim()));
    const map = new Map<string, string>(); // name -> part

    parsedSongs.forEach((song) => {
      song.performers.forEach((p) => {
        const trimmed = p.name.trim();
        if (!existingNames.has(trimmed) && !map.has(trimmed)) {
          map.set(trimmed, p.part);
        }
      });
    });

    return Array.from(map.entries()).map(([name, part]) => ({ name, part }));
  }, [parsedSongs, existingPerformers]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (parsedSongs.length === 0) return;

    const songsToImport: SetlistItem[] = parsedSongs.map((s) => ({
      title: s.title,
      artist: s.artist,
      session_members: s.session_members,
    }));

    onImportSetlists(
      songsToImport,
      importMode,
      autoAddPerformers ? newPerformers : []
    );

    setPasteText("");
    onClose();
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-primary/30 bg-primary/5 space-y-4 shadow-sm animate-in fade-in-50 duration-200">
      {/* 1. 헤더 바 */}
      <div className="flex items-center justify-between gap-2 border-b border-primary/20 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary text-primary-foreground">
            <FileSpreadsheet className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              셋리스트 엑셀/스프레드시트 일괄 가져오기
            </h3>
            <p className="text-[11px] text-muted-foreground">
              스프레드시트 표를 복사하여 붙여넣으면 곡 제목, 아티스트 및 각 세션별 연주자를 자동 분류합니다.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-7 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* 2. 설명 및 지원 형식 안내 */}
      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-background/80 border border-border/60 text-xs text-muted-foreground leading-relaxed">
        <Info className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            표 헤더(열 이름)를 포함하여 복사하면 자동으로 열을 매핑합니다.
          </p>
          <p className="text-[11px] text-muted-foreground">
            예시 1: <code className="text-primary font-mono font-medium">곡 | 아티스트 | 보컬 | 기타1 | 기타2 | 베이스 | 키보드 | 드럼</code><br />
            예시 2: <code className="text-primary font-mono font-medium">곡 | 보컬 | 기타1 | 기타2 | 베이스 | 키보드1 | 키보드2 | 드럼</code> (아티스트 생략 가능)
          </p>
        </div>
      </div>

      {/* 3. 텍스트에어리어 입력창 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="setlist-paste-textarea" className="text-xs font-semibold text-foreground">
            스프레드시트 데이터 붙여넣기 (Ctrl + V)
          </Label>
          {pasteText.trim() && (
            <button
              type="button"
              onClick={() => setPasteText("")}
              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              입력창 비우기
            </button>
          )}
        </div>
        <Textarea
          id="setlist-paste-textarea"
          rows={5}
          placeholder={`곡\t보컬\t기타1\t기타2\t베이스\t키보드1\t키보드2\t드럼\n축배\t윤소영\t남채현\t김서율\t임준\t강윤아\t\t김서연\nemotions\t이윤아\t허원\t남채현\t박예찬\t황두현\t임준\t이건영`}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          className="text-xs font-mono bg-background border-border placeholder:text-muted-foreground/50 resize-y"
        />
      </div>

      {/* 4. 옵션 설정 (추가 모드 & 공연자 자동 등록) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-background border border-border/70 text-xs">
        {/* 추가 방식 라디오 */}
        <div className="flex items-center gap-4">
          <span className="font-semibold text-foreground">반영 방식:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="import-mode"
              value="append"
              checked={importMode === "append"}
              onChange={() => setImportMode("append")}
              className="accent-primary"
            />
            <span>기존 셋리스트 뒤에 추가</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="import-mode"
              value="replace"
              checked={importMode === "replace"}
              onChange={() => setImportMode("replace")}
              className="accent-primary"
            />
            <span className="text-destructive font-medium">기존 목록 덮어쓰기 (전체 교체)</span>
          </label>
        </div>

        {/* 공연자 명단 동시 등록 체크박스 */}
        <label className="flex items-center gap-1.5 cursor-pointer text-primary font-medium select-none">
          <input
            type="checkbox"
            checked={autoAddPerformers}
            onChange={(e) => setAutoAddPerformers(e.target.checked)}
            className="rounded accent-primary size-3.5"
          />
          <Users className="size-3.5" />
          <span>신규 연주자 [공연자] 명단에 자동 등록 ({newPerformers.length}명)</span>
        </label>
      </div>

      {/* 5. 실시간 파싱 미리보기 */}
      {parsedSongs.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">
                파싱 미리보기 ({parsedSongs.length}곡 감지됨)
              </span>
            </div>
            {detectedHeaders.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                인식된 헤더: {detectedHeaders.join(" / ")}
              </span>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto rounded-xl border border-border bg-background shadow-2xs divide-y divide-border/60">
            {parsedSongs.map((song, idx) => (
              <div
                key={idx}
                className="p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[11px] font-mono font-bold text-muted-foreground bg-muted size-5 rounded flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-bold text-foreground truncate">
                        {song.title}
                      </span>
                      {song.artist ? (
                        <span className="text-[11px] text-muted-foreground">
                          — {song.artist}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 italic">
                          (아티스트 미지정)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 연주자 명단 뱃지 요약 */}
                <div className="flex flex-wrap items-center gap-1 sm:max-w-md sm:justify-end">
                  {(() => {
                    const slots = parseSessionSlots(song.session_members);
                    if (slots.length === 0) {
                      return <span className="text-[10px] text-muted-foreground/60">연주자 없음</span>;
                    }
                    return slots.map((slot) => (
                      <span
                        key={slot.sessionName}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium text-foreground/85 border border-border/50"
                      >
                        <span className="text-primary font-semibold">{slot.sessionName}</span>
                        <span>{slot.members.join(", ")}</span>
                      </span>
                    ));
                  })()}
                </div>
              </div>
            ))}
          </div>

          {/* 신규 연주자 등록 안내 뱃지 */}
          {autoAddPerformers && newPerformers.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground p-2 rounded-lg bg-muted/40 border border-border/50">
              <span className="text-[11px] font-semibold text-foreground">
                하단 [공연자] 명단에 새로 추가될 인원 ({newPerformers.length}명):
              </span>
              {newPerformers.map((p) => (
                <Badge
                  key={p.name}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0.5 bg-background gap-1"
                >
                  <span>{p.name}</span>
                  <span className="text-muted-foreground/80">({p.part})</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      ) : pasteText.trim() ? (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
          <Info className="size-4 shrink-0" />
          <span>인식된 곡이 없습니다. 표 구분자(Tab 또는 쉼표)가 올바른지 확인해 주세요.</span>
        </div>
      ) : null}

      {/* 6. 하단 실행 버튼 */}
      <div className="flex items-center justify-end gap-2 pt-1">
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
          disabled={parsedSongs.length === 0}
          onClick={handleApply}
          className="h-8 text-xs font-semibold px-4 gap-1.5 shadow-sm shadow-primary/20"
        >
          <Check className="size-3.5" />
          셋리스트 {parsedSongs.length > 0 ? `${parsedSongs.length}곡 ` : ""}적용하기
        </Button>
      </div>
    </div>
  );
}
