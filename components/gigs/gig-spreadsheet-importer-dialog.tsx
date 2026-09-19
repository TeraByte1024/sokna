"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  FileSpreadsheet,
  Check,
  X,
  Sparkles,
  Users,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  UserCheck,
  Music,
  ListMusic,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Performer } from "@/components/performer-selector";
import type { SetlistItem } from "@/components/gigs/gig-form";
import { serializeSessionSlots, type SessionSlot } from "@/lib/gig";

// ==========================================
// 1. 유틸리티 함수 및 파서
// ==========================================

export function isLikelyNonMemberText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // 단체 지칭어 또는 제외 대상 단어
  if (/하세요|다\s*하세요|전원|다같이|모두|미정|공석|없음|게스트|객원|tbd|tba/i.test(trimmed)) {
    return true;
  }
  // 문장형 종결 어미 (~, ?, !)
  if (/[~?!]$/.test(trimmed)) {
    return true;
  }
  // 이름 길이가 너무 긺 (> 10자)
  if (trimmed.length > 10) {
    return true;
  }
  // 한글 문장 패턴 (예: "다 하세요", "원하는 사람")
  if (/^다\s+|원하는|누구나|자유/.test(trimmed)) {
    return true;
  }
  return false;
}

export function normalizePartName(rawHeader: string): string {
  const clean = rawHeader.trim();
  // 뒷자리 숫자 및 공백/특수문자 제거 (예: 기타1 -> 기타, 키보드2 -> 키보드, 건반 1 -> 건반)
  const withoutNum = clean.replace(/[\s_\-]*\d+$/, "").trim();
  if (/건반|키보드|피아노|신디|keyboard|piano|synth/i.test(withoutNum)) return "키보드";
  if (/일렉기타|어쿠스틱기타|일렉|어쿠스틱|통기타|기타|guitar/i.test(withoutNum)) return "기타";
  if (/베이스|bass/i.test(withoutNum)) return "베이스";
  if (/드럼|drum/i.test(withoutNum)) return "드럼";
  if (/보컬|vocal|voc/i.test(withoutNum)) return "보컬";
  if (/코러스/i.test(withoutNum)) return "코러스";
  if (/브라스|색소폰|트럼펫/i.test(withoutNum)) return "브라스";
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

export type TableFormat = "session_distribution" | "performers";

export interface ColumnMeta {
  index: number;
  rawHeader: string;
  kind: "title" | "artist" | "session" | "generation" | "name" | "ignore";
  partName: string;
}

export interface ParsedRawSong {
  title: string;
  artist: string;
  slots: { sessionName: string; memberNames: string[] }[];
}

export interface ParsedRawPerformer {
  name: string;
  generation?: number | null;
  sessions: string[];
}

export interface ParsedSpreadsheetResult {
  format: TableFormat;
  detectedHeaders: string[];
  columnMetas: ColumnMeta[];
  songs: ParsedRawSong[];
  rawPerformers: ParsedRawPerformer[];
}

export function parseSpreadsheetText(rawText: string): ParsedSpreadsheetResult {
  if (!rawText.trim()) {
    return {
      format: "session_distribution",
      detectedHeaders: [],
      columnMetas: [],
      songs: [],
      rawPerformers: [],
    };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      format: "session_distribution",
      detectedHeaders: [],
      columnMetas: [],
      songs: [],
      rawPerformers: [],
    };
  }

  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : "\t";
  const rows = lines.map((line) => splitRowCells(line, delimiter));
  const firstRow = rows[0];

  // 키워드 사전 (사용자 피드백 반영: singer, 학번 제외)
  const titleKeywords = ["곡", "곡명", "곡제목", "곡 제목", "노래", "제목", "title", "song"];
  const artistKeywords = ["아티스트", "가수", "원곡자", "원곡", "artist"];
  const generationKeywords = ["기수", "대수", "gen", "generation"];
  const nameKeywords = ["이름", "성명", "부원", "부원명", "멤버", "name", "member"];
  const instrumentKeywords = [
    "보컬", "vocal", "기타", "guitar", "일렉", "어쿠스틱",
    "베이스", "bass", "키보드", "건반", "피아노", "신디", "keyboard",
    "드럼", "drum", "코러스", "브라스", "색소폰",
  ];

  // 헤더 여부 판별
  const hasTitleKeyword = firstRow.some((c) => titleKeywords.includes(c.toLowerCase()));
  const hasGenerationKeyword = firstRow.some((c) => generationKeywords.includes(c.toLowerCase()));
  const hasNameKeyword = firstRow.some((c) => nameKeywords.includes(c.toLowerCase()));
  const hasInstrumentKeywords = firstRow.some((c) =>
    instrumentKeywords.some((kw) => c.toLowerCase().includes(kw))
  );

  const isHeader = hasTitleKeyword || hasGenerationKeyword || hasNameKeyword || hasInstrumentKeywords;

  let headers: string[] = [];
  let dataRows: string[][] = [];

  if (isHeader) {
    headers = firstRow;
    dataRows = rows.slice(1);
  } else {
    // 헤더가 없는 경우: 기본 세션 분배표 순서
    headers = ["곡", "보컬", "기타1", "기타2", "베이스", "키보드1", "키보드2", "드럼"];
    dataRows = rows;
  }

  // 형식(Format) 자동 판별
  // 1) 기수/이름이 있고 악기 컬럼이 1개 이하거나 없으면: 참여자 명단표 (Type 1)
  // 2) 곡 제목이 있거나 악기 컬럼이 2개 이상이면: 세션 분배 결과표 (Type 2)
  const genCount = headers.filter((h) => generationKeywords.includes(h.toLowerCase())).length;
  const instCount = headers.filter((h) =>
    instrumentKeywords.some((kw) => h.toLowerCase().includes(kw))
  ).length;

  const format: TableFormat =
    genCount > 0 && instCount <= 1 ? "performers" : "session_distribution";

  // 컬럼 메타 정보 구성
  const columnMetas: ColumnMeta[] = headers.map((rawHeader, idx) => {
    const clean = rawHeader.trim();
    const lower = clean.toLowerCase();

    if (format === "performers") {
      if (generationKeywords.includes(lower)) {
        return { index: idx, rawHeader: clean, kind: "generation", partName: "" };
      }
      if (nameKeywords.includes(lower)) {
        return { index: idx, rawHeader: clean, kind: "name", partName: "" };
      }
      if (lower === "no" || lower === "#" || lower === "번호" || lower === "순번") {
        return { index: idx, rawHeader: clean, kind: "ignore", partName: "" };
      }
      // 그 외는 세션/파트 컬럼
      return { index: idx, rawHeader: clean, kind: "session", partName: normalizePartName(clean) };
    }

    // format === "session_distribution"
    if (titleKeywords.includes(lower)) {
      return { index: idx, rawHeader: clean, kind: "title", partName: "" };
    }
    if (artistKeywords.includes(lower)) {
      return { index: idx, rawHeader: clean, kind: "artist", partName: "" };
    }
    if (lower === "no" || lower === "#" || lower === "번호" || lower === "순서" || lower === "순번") {
      return { index: idx, rawHeader: clean, kind: "ignore", partName: "" };
    }
    // 기본적으로 악기/세션 컬럼으로 인식
    return { index: idx, rawHeader: clean, kind: "session", partName: normalizePartName(clean) };
  });

  // 세션 분배표에서 곡 제목 컬럼 확인
  if (format === "session_distribution") {
    const titleIndex = columnMetas.findIndex((c) => c.kind === "title");
    if (titleIndex === -1 && columnMetas.length > 0) {
      // 0번째 컬럼을 곡 제목으로 기본 지정
      columnMetas[0] = { index: 0, rawHeader: headers[0] || "곡", kind: "title", partName: "" };
    }
  }

  // 참여자 명단표에서 이름 컬럼 확인
  if (format === "performers") {
    const nameIndex = columnMetas.findIndex((c) => c.kind === "name");
    if (nameIndex === -1 && columnMetas.length > 1) {
      columnMetas[1] = { index: 1, rawHeader: headers[1] || "이름", kind: "name", partName: "" };
    }
  }

  const parsedSongs: ParsedRawSong[] = [];
  const performerMap = new Map<string, { generation?: number | null; sessions: Set<string> }>();

  if (format === "session_distribution") {
    const titleCol = columnMetas.find((c) => c.kind === "title");
    const artistCol = columnMetas.find((c) => c.kind === "artist");

    for (const row of dataRows) {
      if (row.length === 0 || row.every((c) => !c.trim())) continue;

      const title = titleCol ? row[titleCol.index]?.trim() || "" : "";
      if (!title) continue;

      const artist = artistCol ? row[artistCol.index]?.trim() || "" : "";
      const slots: { sessionName: string; memberNames: string[] }[] = [];

      columnMetas.forEach((colMeta) => {
        if (colMeta.kind !== "session") return;
        const cellValue = row[colMeta.index]?.trim();
        if (!cellValue || cellValue === "-" || cellValue === "/" || cellValue === "없음") {
          return;
        }

        // 쉼표, 슬래시, &로 다중 연주자 분리
        const memberNames = cellValue
          .split(/[,/&]/)
          .map((n) => n.trim())
          .filter(Boolean);

        if (memberNames.length > 0) {
          // global 세션명으로 통일 (기타1/기타2 -> 기타, 키보드/건반 -> 키보드)
          const slotSessionName = colMeta.partName;
          const existingSlot = slots.find((s) => s.sessionName === slotSessionName);
          if (existingSlot) {
            memberNames.forEach((name) => {
              if (!existingSlot.memberNames.includes(name)) {
                existingSlot.memberNames.push(name);
              }
            });
          } else {
            slots.push({
              sessionName: slotSessionName,
              memberNames: [...memberNames],
            });
          }

          memberNames.forEach((name) => {
            const existing = performerMap.get(name) || { sessions: new Set<string>() };
            existing.sessions.add(colMeta.partName);
            performerMap.set(name, existing);
          });
        }
      });

      // 표준 세션 순서 정렬 (보컬 -> 기타 -> 베이스 -> 키보드 -> 드럼)
      const SESSION_ORDER = ["보컬", "기타", "베이스", "키보드", "드럼"];
      slots.sort((a, b) => {
        const idxA = SESSION_ORDER.indexOf(a.sessionName);
        const idxB = SESSION_ORDER.indexOf(b.sessionName);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.sessionName.localeCompare(b.sessionName);
      });

      parsedSongs.push({
        title,
        artist,
        slots,
      });
    }
  } else {
    // format === "performers"
    const genCol = columnMetas.find((c) => c.kind === "generation");
    const nameCol = columnMetas.find((c) => c.kind === "name");
    const sessionCol = columnMetas.find((c) => c.kind === "session");

    for (const row of dataRows) {
      if (row.length === 0 || row.every((c) => !c.trim())) continue;

      const name = nameCol ? row[nameCol.index]?.trim() || "" : "";
      if (!name) continue;

      let gen: number | null = null;
      if (genCol && row[genCol.index]) {
        const num = parseInt(row[genCol.index].replace(/[^0-9]/g, ""), 10);
        if (!isNaN(num)) gen = num;
      }

      const part = sessionCol ? normalizePartName(row[sessionCol.index] || "세션") : "세션";

      const existing = performerMap.get(name) || { generation: gen, sessions: new Set<string>() };
      if (gen !== null) existing.generation = gen;
      existing.sessions.add(part);
      performerMap.set(name, existing);
    }
  }

  const rawPerformers: ParsedRawPerformer[] = Array.from(performerMap.entries()).map(
    ([name, info]) => ({
      name,
      generation: info.generation ?? null,
      sessions: Array.from(info.sessions),
    })
  );

  return {
    format,
    detectedHeaders: headers,
    columnMetas,
    songs: parsedSongs,
    rawPerformers,
  };
}

// ==========================================
// 2. Conflict 인터페이스 정의
// ==========================================

export interface NonMemberConflict {
  id: string;
  rawText: string;
  songTitles: string[];
  sessionName: string;
  action: "ignore" | "keep";
}

export interface DuplicateNameConflict {
  id: string;
  name: string;
  sessions: string[];
  decision: "same_person" | "homonym";
}

export interface DBUserSummary {
  id: string;
  name: string;
  email?: string | null;
  generation?: number | null;
  part?: string | null;
}

export interface AccountMatchConflict {
  id: string;
  performerKey: string;
  name: string;
  sessionPart: string;
  matchedUsers: DBUserSummary[];
  selectedUserId: string | "manual" | "dummy";
  manualInfo?: {
    name: string;
    generation?: number | null;
    email?: string;
  };
}

export interface VocalGenderConflict {
  id: string;
  performerKey: string;
  name: string;
  selectedGender: "남보컬" | "여보컬" | "공통";
}

export interface SessionMismatchConflict {
  id: string;
  performerName: string;
  userId: string;
  generation?: number | null;
  userSavedPart: string; // {users 저장 세션}
  excelPart: string;     // {엑셀 세션}
  selectedChoice: "user_saved" | "excel";
}

// ==========================================
// 3. 다이얼로그 컴포넌트 Props
// ==========================================

interface GigSpreadsheetImporterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  existingPerformersCount: number;
  existingSetlistsCount: number;
  onApplyImport: (result: {
    performers: Performer[];
    setlists?: SetlistItem[];
    mode: "performers_only" | "full";
  }) => void;
}

export function GigSpreadsheetImporterDialog({
  isOpen,
  onClose,
  existingPerformersCount,
  existingSetlistsCount,
  onApplyImport,
}: GigSpreadsheetImporterDialogProps) {
  const supabase = createClient();

  // 단계: paste (붙여넣기) -> conflicts (충돌 해결) -> preview (최종 확인)
  const [step, setStep] = useState<"paste" | "conflicts" | "preview">("paste");
  const [pasteText, setPasteText] = useState("");
  const [overrideFormat, setOverrideFormat] = useState<TableFormat | null>(null);

  // 파싱 결과
  const parsedData = useMemo(() => {
    const res = parseSpreadsheetText(pasteText);
    if (overrideFormat) {
      res.format = overrideFormat;
    }
    return res;
  }, [pasteText, overrideFormat]);

  // Conflict 상태 관리
  const [sessionMismatchConflicts, setSessionMismatchConflicts] = useState<SessionMismatchConflict[]>([]);
  const [nonMemberConflicts, setNonMemberConflicts] = useState<NonMemberConflict[]>([]);
  const [duplicateNameConflicts, setDuplicateNameConflicts] = useState<DuplicateNameConflict[]>([]);
  const [accountMatchConflicts, setAccountMatchConflicts] = useState<AccountMatchConflict[]>([]);
  const [vocalGenderConflicts, setVocalGenderConflicts] = useState<VocalGenderConflict[]>([]);
  const [matchedUsersMap, setMatchedUsersMap] = useState<Record<string, DBUserSummary[]>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 초기화
  useEffect(() => {
    if (!isOpen) {
      setStep("paste");
      setPasteText("");
      setOverrideFormat(null);
      setSessionMismatchConflicts([]);
      setNonMemberConflicts([]);
      setDuplicateNameConflicts([]);
      setAccountMatchConflicts([]);
      setVocalGenderConflicts([]);
      setMatchedUsersMap({});
    }
  }, [isOpen]);

  // Step 1 -> Step 2 / Step 3 분석 및 전환
  const handleProceedFromPaste = async () => {
    if (!pasteText.trim() || parsedData.rawPerformers.length === 0) {
      toast.error("표 데이터를 올바르게 입력해주세요.");
      return;
    }

    setIsAnalyzing(true);
    try {
      // 1단계: 비인명 감지
      const nonMembers: NonMemberConflict[] = [];
      parsedData.rawPerformers.forEach((p) => {
        if (isLikelyNonMemberText(p.name)) {
          const songsContaining = parsedData.songs
            .filter((s) => s.slots.some((sl) => sl.memberNames.includes(p.name)))
            .map((s) => s.title);
          nonMembers.push({
            id: `non-${p.name}`,
            rawText: p.name,
            songTitles: songsContaining,
            sessionName: p.sessions.join(", "),
            action: "ignore", // 기본값: 무시하기
          });
        }
      });
      setNonMemberConflicts(nonMembers);

      // 무시되지 않은 정상 연주자 목록 후보
      const validRawPerformers = parsedData.rawPerformers.filter(
        (p) => !nonMembers.some((nm) => nm.rawText === p.name && nm.action === "ignore")
      );

      // 2단계: 중복 이름 (1인 다세션)
      const dupConflicts: DuplicateNameConflict[] = [];
      validRawPerformers.forEach((p) => {
        // 2개 이상의 서로 다른 정규화 세션을 맡고 있는 경우
        if (p.sessions.length >= 2) {
          dupConflicts.push({
            id: `dup-${p.name}`,
            name: p.name,
            sessions: p.sessions,
            decision: "same_person", // 기본값: 동일 인물
          });
        }
      });
      setDuplicateNameConflicts(dupConflicts);

      // 부원 DB 동명이인 / 계정 매칭 및 세션 정보 조회를 위한 Supabase 조회
      const namesToQuery = Array.from(new Set(validRawPerformers.map((p) => p.name.trim())));
      const { data: matchedUsersData, error } = await supabase
        .from("users")
        .select("id, name, email, generation, part")
        .in("name", namesToQuery)
        .neq("status", "rejected");

      if (error) {
        console.error("부원 계정 조회 실패:", error);
      }

      const userMap: Record<string, DBUserSummary[]> = {};
      (matchedUsersData ?? []).forEach((u) => {
        const list = userMap[u.name] || [];
        list.push(u);
        userMap[u.name] = list;
      });
      setMatchedUsersMap(userMap);

      // 1단계: 등록 회원 세션 불일치 확인
      // 등록된 회원이 users에 등록된 세션과 다른 세션으로 입력될 경우: {users 저장 세션} / {엑셀 세션} 중 선택
      const sessionMismatches: SessionMismatchConflict[] = [];
      validRawPerformers.forEach((p) => {
        const matched = userMap[p.name.trim()] || [];
        let targetUser: DBUserSummary | null = null;
        if (matched.length === 1) {
          targetUser = matched[0];
        } else if (matched.length > 1 && p.generation) {
          const exactGenMatch = matched.filter((u) => u.generation === p.generation);
          if (exactGenMatch.length === 1) {
            targetUser = exactGenMatch[0];
          }
        }

        if (targetUser && targetUser.part && targetUser.part.trim().length > 0) {
          const userSavedPart = targetUser.part.trim();
          const userNorm = normalizePartName(userSavedPart);
          const excelSessions = p.sessions.length > 0 ? p.sessions : ["세션"];
          const excelNorms = excelSessions.map((s) => normalizePartName(s));
          const excelPartStr = excelSessions.join(", ");

          // 세션 일치 여부 확인 (보컬, 키보드, 기타 계열 변형 고려)
          const isVocalVariant = userNorm === "보컬" && excelNorms.length === 1 && excelNorms[0] === "보컬";
          const isKeyboardVariant = userNorm === "키보드" && excelNorms.length === 1 && excelNorms[0] === "키보드";
          const isGuitarVariant = userNorm === "기타" && excelNorms.length === 1 && excelNorms[0] === "기타";

          const isSameInstrument =
            excelNorms.length === 1 &&
            (excelNorms[0] === userNorm || isVocalVariant || isKeyboardVariant || isGuitarVariant);

          if (!isSameInstrument) {
            sessionMismatches.push({
              id: `sess-${p.name}`,
              performerName: p.name,
              userId: targetUser.id,
              generation: targetUser.generation ?? p.generation ?? null,
              userSavedPart,
              excelPart: excelPartStr,
              selectedChoice: "excel", // 기본값: 엑셀 세션
            });
          }
        }
      });
      setSessionMismatchConflicts(sessionMismatches);

      // 3단계: 부원 DB 동명이인 / 계정 매칭 (동명이인인 경우)
      const acctConflicts: AccountMatchConflict[] = [];
      validRawPerformers.forEach((p) => {
        const matched = userMap[p.name.trim()] || [];
        // DB에 2명 이상 있거나, 기수가 일치하지 않는 경우
        if (matched.length >= 2) {
          // 만약 엑셀에 기수가 명시되어 있고 그 기수의 부원이 유일하다면 자동 매칭
          const exactGenMatch = p.generation
            ? matched.filter((u) => u.generation === p.generation)
            : [];
          if (exactGenMatch.length === 1) {
            // 자동 해결
          } else {
            acctConflicts.push({
              id: `acct-${p.name}`,
              performerKey: p.name,
              name: p.name,
              sessionPart: p.sessions.join(", "),
              matchedUsers: matched,
              selectedUserId: matched[0]?.id || "dummy",
            });
          }
        }
      });
      setAccountMatchConflicts(acctConflicts);

      // 4단계: 보컬 성별 구분
      const vocalConflicts: VocalGenderConflict[] = [];
      validRawPerformers.forEach((p) => {
        const isVocal = p.sessions.some((s) => s.includes("보컬"));
        if (isVocal) {
          const matched = userMap[p.name.trim()] || [];
          const singleUser = matched.length === 1 ? matched[0] : null;
          // DB 유저의 part가 이미 "보컬(남)" 또는 "보컬(여)"인 경우 자동 확정
          if (singleUser && (singleUser.part === "보컬(남)" || singleUser.part === "보컬(여)")) {
            // 이미 성별 명시됨
          } else {
            vocalConflicts.push({
              id: `voc-${p.name}`,
              performerKey: p.name,
              name: p.name,
              selectedGender: "공통", // 기본값
            });
          }
        }
      });
      setVocalGenderConflicts(vocalConflicts);

      // 전체 conflict 건수 확인
      const totalConflictsCount =
        sessionMismatches.length +
        nonMembers.length +
        dupConflicts.length +
        acctConflicts.length +
        vocalConflicts.length;

      if (totalConflictsCount > 0) {
        setStep("conflicts");
      } else {
        setStep("preview");
      }
    } catch (err) {
      console.error("스프레드시트 분석 중 오류 발생:", err);
      toast.error("데이터 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ==========================================
  // 4. 최종 데이터 계산 (Conflict 반영)
  // ==========================================

  const resolvedData = useMemo(() => {
    // 0. 세션 불일치 매핑
    const sessionMismatchMap = new Map<string, SessionMismatchConflict>();
    sessionMismatchConflicts.forEach((c) => {
      sessionMismatchMap.set(c.performerName, c);
    });

    // 1. 비인명 무시 목록
    const ignoredNames = new Set(
      nonMemberConflicts.filter((c) => c.action === "ignore").map((c) => c.rawText)
    );

    // 2. 동명이인 분리 매핑 (name -> boolean)
    const homonymNames = new Set(
      duplicateNameConflicts.filter((c) => c.decision === "homonym").map((c) => c.name)
    );

    // 3. 보컬 성별 매핑 (performerKey -> gender)
    const vocalGenderMap = new Map<string, string>();
    vocalGenderConflicts.forEach((c) => {
      if (c.selectedGender === "남보컬") vocalGenderMap.set(c.name, "보컬(남)");
      else if (c.selectedGender === "여보컬") vocalGenderMap.set(c.name, "보컬(여)");
      else vocalGenderMap.set(c.name, "보컬");
    });

    // 4. 계정 매칭 매핑
    const accountMap = new Map<string, AccountMatchConflict>();
    accountMatchConflicts.forEach((c) => {
      accountMap.set(c.performerKey, c);
    });

    // 최종 공연자 목록 생성
    const finalPerformers: Performer[] = [];

    parsedData.rawPerformers.forEach((rawP) => {
      if (ignoredNames.has(rawP.name)) return;

      if (homonymNames.has(rawP.name)) {
        // 동명이인으로 분리: 각 세션마다 개별 공연자로 생성
        rawP.sessions.forEach((sess, idx) => {
          let partName = sess;
          if (sess === "보컬" && vocalGenderMap.has(rawP.name)) {
            partName = vocalGenderMap.get(rawP.name)!;
          }

          // 더미일 경우 번호 부여: "이름 1", "이름 2"
          const numberedName = `${rawP.name} ${idx + 1}`;
          finalPerformers.push({
            name: numberedName,
            email: `temp-${Math.random().toString(36).substring(2, 9)}`,
            generation: rawP.generation ?? null,
            part: partName,
          });
        });
      } else {
        // 동일 인물: 세션 결정
        let determinedPart: string;
        const mismatch = sessionMismatchMap.get(rawP.name);
        if (mismatch) {
          determinedPart =
            mismatch.selectedChoice === "user_saved"
              ? mismatch.userSavedPart
              : mismatch.excelPart;
        } else {
          determinedPart = rawP.sessions
            .map((s) => (s === "보컬" && vocalGenderMap.has(rawP.name) ? vocalGenderMap.get(rawP.name)! : s))
            .join(", ");
        }

        // 계정 연동 결정 (accountMatchConflicts 우선)
        const acct = accountMap.get(rawP.name);
        if (acct) {
          if (acct.selectedUserId === "dummy") {
            finalPerformers.push({
              name: rawP.name,
              email: `temp-${Math.random().toString(36).substring(2, 9)}`,
              generation: rawP.generation ?? null,
              part: determinedPart || "세션",
            });
            return;
          }
          if (acct.selectedUserId === "manual" && acct.manualInfo) {
            finalPerformers.push({
              name: acct.manualInfo.name || rawP.name,
              email: acct.manualInfo.email || `temp-${Math.random().toString(36).substring(2, 9)}`,
              generation: acct.manualInfo.generation ?? rawP.generation ?? null,
              part: determinedPart || "세션",
            });
            return;
          }
          const userObj = acct.matchedUsers.find((u) => u.id === acct.selectedUserId);
          if (userObj) {
            finalPerformers.push({
              id: userObj.id,
              name: userObj.name,
              email: userObj.email ?? undefined,
              generation: userObj.generation ?? rawP.generation ?? null,
              part: determinedPart || userObj.part || "세션",
            });
            return;
          }
        }

        // 단일 일치 또는 기수 매칭된 DB 부원 자동 연동
        const matched = matchedUsersMap[rawP.name.trim()] || [];
        let autoUser: DBUserSummary | null = null;
        if (matched.length === 1) {
          autoUser = matched[0];
        } else if (matched.length > 1 && rawP.generation) {
          const exactGen = matched.filter((u) => u.generation === rawP.generation);
          if (exactGen.length === 1) {
            autoUser = exactGen[0];
          }
        }

        if (autoUser) {
          finalPerformers.push({
            id: autoUser.id,
            name: autoUser.name,
            email: autoUser.email ?? undefined,
            generation: autoUser.generation ?? rawP.generation ?? null,
            part: determinedPart || autoUser.part || "세션",
          });
          return;
        }

        // 기본 더미 또는 외부 사용자
        finalPerformers.push({
          name: rawP.name,
          email: `temp-${Math.random().toString(36).substring(2, 9)}`,
          generation: rawP.generation ?? null,
          part: determinedPart || "세션",
        });
      }
    });

    // 최종 셋리스트 목록 생성 (세션 분배표인 경우)
    const finalSetlists: SetlistItem[] = [];

    if (parsedData.format === "session_distribution") {
      parsedData.songs.forEach((song, idx) => {
        const cleanedSlots: SessionSlot[] = song.slots
          .map((slot) => {
            const validMembers = slot.memberNames
              .filter((m) => !ignoredNames.has(m))
              .map((m) => {
                // 동명이인 분리된 인물이라면 해당 세션 번호로 매핑
                if (homonymNames.has(m)) {
                  const rawP = parsedData.rawPerformers.find((p) => p.name === m);
                  const sessIdx = rawP?.sessions.findIndex((s) => s === normalizePartName(slot.sessionName));
                  if (sessIdx !== undefined && sessIdx >= 0) {
                    return `${m} ${sessIdx + 1}`;
                  }
                }
                return m;
              });

            return {
              sessionName: slot.sessionName,
              members: validMembers,
            };
          })
          .filter((slot) => slot.members.length > 0);

        finalSetlists.push({
          order_num: idx + 1,
          title: song.title,
          artist: song.artist || "",
          session_members: serializeSessionSlots(cleanedSlots),
        });
      });
    }

    return {
      performers: finalPerformers,
      setlists: finalSetlists,
    };
  }, [
    parsedData,
    sessionMismatchConflicts,
    nonMemberConflicts,
    duplicateNameConflicts,
    accountMatchConflicts,
    vocalGenderConflicts,
    matchedUsersMap,
  ]);

  // 최종 덮어쓰기 적용
  const handleConfirmApply = () => {
    if (resolvedData.performers.length === 0 && resolvedData.setlists.length === 0) {
      toast.error("불러올 수 있는 유효한 데이터가 없습니다.");
      return;
    }

    onApplyImport({
      performers: resolvedData.performers,
      setlists: parsedData.format === "session_distribution" ? resolvedData.setlists : undefined,
      mode: parsedData.format === "session_distribution" ? "full" : "performers_only",
    });

    toast.success(
      parsedData.format === "session_distribution"
        ? `셋리스트 ${resolvedData.setlists.length}곡 및 공연자 ${resolvedData.performers.length}명을 덮어쓰기 등록했습니다.`
        : `공연자 ${resolvedData.performers.length}명을 덮어쓰기 등록했습니다.`
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-3xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* 1. 모달 헤더 바 */}
        <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <FileSpreadsheet className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-foreground truncate flex items-center gap-2">
                엑셀 표 일괄 불러오기
                <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/30">
                  기존 내역 덮어쓰기
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                엑셀/스프레드시트에서 복사한 표를 붙여넣어 공연자와 셋리스트를 일괄 등록합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0"
            aria-label="닫기"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 2. 상단 프로그레스 바 */}
        <div className="flex items-center border-b border-border/60 bg-muted/10 px-4 py-2.5 text-xs">
          <div
            className={cn(
              "flex items-center gap-1.5 font-semibold transition-colors",
              step === "paste" ? "text-primary font-bold" : "text-muted-foreground"
            )}
          >
            <span>표 붙여넣기 및 감지</span>
          </div>

          <ChevronRight className="size-4 text-muted-foreground/40 mx-2 shrink-0" />

          <div
            className={cn(
              "flex items-center gap-1.5 font-semibold transition-colors",
              step === "conflicts" ? "text-primary font-bold" : "text-muted-foreground"
            )}
          >
            <span>Conflict 해결</span>
            {(sessionMismatchConflicts.length > 0 ||
              nonMemberConflicts.length > 0 ||
              duplicateNameConflicts.length > 0 ||
              accountMatchConflicts.length > 0 ||
              vocalGenderConflicts.length > 0) && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                {sessionMismatchConflicts.length +
                  nonMemberConflicts.length +
                  duplicateNameConflicts.length +
                  accountMatchConflicts.length +
                  vocalGenderConflicts.length}
              </Badge>
            )}
          </div>

          <ChevronRight className="size-4 text-muted-foreground/40 mx-2 shrink-0" />

          <div
            className={cn(
              "flex items-center gap-1.5 font-semibold transition-colors",
              step === "preview" ? "text-primary font-bold" : "text-muted-foreground"
            )}
          >
            <span>미리보기 및 덮어쓰기</span>
          </div>
        </div>

        {/* 3. 메인 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* STEP 1: 붙여넣기 및 감지 */}
          {step === "paste" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <FileSpreadsheet className="size-3.5 text-primary" />
                    엑셀 또는 구글 스프레드시트 표 붙여넣기 (Ctrl + V)
                  </Label>
                  {parsedData.detectedHeaders.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      감지된 컬럼 {parsedData.detectedHeaders.length}개
                    </span>
                  )}
                </div>

                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="엑셀에서 표 영역을 선택한 후 복사(Ctrl+C)하여 여기에 붙여넣기(Ctrl+V)하세요.&#10;&#10;[지원 형식 1] 참여자 명단표: 기수 | 이름 | 세션&#10;[지원 형식 2] 세션 분배 결과표: 곡 | (아티스트) | 보컬 | 기타1 | 기타2 | 베이스 | 키보드1 | 키보드2 | 드럼"
                  rows={8}
                  className="font-mono text-xs leading-relaxed resize-y bg-background border-border"
                  autoFocus
                />
              </div>

              {/* 실시간 감지 상태 요약 */}
              {pasteText.trim().length > 0 && (
                <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        {parsedData.format === "session_distribution"
                          ? "세션 분배 결과표 감지됨"
                          : "참여자 명단표 감지됨"}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {parsedData.format === "session_distribution"
                          ? `곡 ${parsedData.songs.length}개 / 연주자 ${parsedData.rawPerformers.length}명`
                          : `공연자 ${parsedData.rawPerformers.length}명`}
                      </Badge>
                    </div>

                    {/* 표 형식 수동 전환 탭 */}
                    <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setOverrideFormat("session_distribution")}
                        className={cn(
                          "px-2.5 py-1 rounded-md transition-all font-medium",
                          parsedData.format === "session_distribution"
                            ? "bg-background text-foreground shadow-xs font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        세션 분배표 (곡+공연자)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverrideFormat("performers")}
                        className={cn(
                          "px-2.5 py-1 rounded-md transition-all font-medium",
                          parsedData.format === "performers"
                            ? "bg-background text-foreground shadow-xs font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        참여자 명단표 (공연자만)
                      </button>
                    </div>
                  </div>

                  {/* 감지된 컬럼 태그 바 */}
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] text-muted-foreground font-medium">감지된 컬럼 역할:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedData.columnMetas.map((col, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-background border border-border shadow-2xs font-mono"
                        >
                          <span className="text-foreground font-bold">{col.rawHeader}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-primary font-semibold">
                            {col.kind === "title"
                              ? "곡 제목"
                              : col.kind === "artist"
                              ? "아티스트"
                              : col.kind === "generation"
                              ? "기수"
                              : col.kind === "name"
                              ? "이름"
                              : col.kind === "session"
                              ? `세션(${col.partName})`
                              : "제외"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: 스마트 Conflict 해결 */}
          {step === "conflicts" && (
            <div className="space-y-5">
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
                <p>
                  스프레드시트 파싱 중 확인이 필요한 항목들이 발견되었습니다. 아래 안내에 따라 간단히 선택해주시면 자동으로 매핑 및 정리가 완료됩니다.
                </p>
              </div>

              {/* 1단계: 등록 회원 세션 불일치 확인 */}
              {sessionMismatchConflicts.length > 0 && (
                <div className="space-y-2.5 p-3.5 rounded-xl border border-primary/30 bg-primary/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <h3 className="text-xs font-bold text-foreground">
                        등록 회원 세션 확인 ({sessionMismatchConflicts.length}명)
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSessionMismatchConflicts((prev) =>
                            prev.map((c) => ({ ...c, selectedChoice: "user_saved" }))
                          );
                        }}
                        className="h-6 text-[11px] px-2 bg-background hover:bg-muted"
                      >
                        전체 users 세션
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSessionMismatchConflicts((prev) =>
                            prev.map((c) => ({ ...c, selectedChoice: "excel" }))
                          );
                        }}
                        className="h-6 text-[11px] px-2 bg-background hover:bg-muted"
                      >
                        전체 엑셀 세션
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    등록된 회원의 동아리 정보(users)에 저장된 세션과 엑셀에 입력된 세션이 다릅니다. 이번 공연에 적용할 세션을 선택하세요.
                  </p>

                  <div className="space-y-2 pt-1">
                    {sessionMismatchConflicts.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-lg border border-border bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-bold text-foreground flex items-center gap-1.5">
                            <span>{c.generation ? `${c.generation}기 ` : ""}{c.performerName}</span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
                              회원 계정 연동
                            </Badge>
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            users 저장 세션: <strong className="text-foreground">{c.userSavedPart}</strong> / 엑셀 세션: <strong className="text-primary">{c.excelPart}</strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant={c.selectedChoice === "user_saved" ? "default" : "outline"}
                            onClick={() => {
                              setSessionMismatchConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, selectedChoice: "user_saved" } : item
                                )
                              );
                            }}
                            className="h-7 text-xs font-semibold"
                          >
                            users 저장 세션 ({c.userSavedPart})
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={c.selectedChoice === "excel" ? "default" : "outline"}
                            onClick={() => {
                              setSessionMismatchConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, selectedChoice: "excel" } : item
                                )
                              );
                            }}
                            className="h-7 text-xs font-semibold"
                          >
                            엑셀 세션 ({c.excelPart})
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 1단계: 비인명 / 특수 메모 텍스트 감지 */}
              {nonMemberConflicts.length > 0 && (
                <div className="space-y-2.5 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="text-xs font-bold text-foreground">
                      비인명 / 특수 텍스트 확인 ({nonMemberConflicts.length}건)
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    부원 이름이 아닌 메모나 안내 문구로 감지된 항목입니다.
                  </p>

                  <div className="space-y-2 pt-1">
                    {nonMemberConflicts.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-lg border border-border bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-bold text-foreground flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-muted font-mono text-amber-600 dark:text-amber-400 font-bold">
                              &ldquo;{c.rawText}&rdquo;
                            </span>
                            <span className="text-muted-foreground font-normal">
                              는 부원 이름이 아닌 메모로 보입니다. 어떻게 처리할까요?
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            등장 곡: {c.songTitles.slice(0, 3).join(", ") || "곡 없음"} (세션: {c.sessionName})
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant={c.action === "ignore" ? "default" : "outline"}
                            onClick={() => {
                              setNonMemberConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, action: "ignore" } : item
                                )
                              );
                            }}
                            className="h-7 text-xs font-semibold"
                          >
                            무시하기 (제외)
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={c.action === "keep" ? "default" : "outline"}
                            onClick={() => {
                              setNonMemberConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, action: "keep" } : item
                                )
                              );
                            }}
                            className="h-7 text-xs font-semibold"
                          >
                            공연자로 등록하기
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2단계: 중복 이름 (1인 다세션 vs 동명이인) */}
              {duplicateNameConflicts.length > 0 && (
                <div className="space-y-2.5 p-3.5 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-primary" />
                    <h3 className="text-xs font-bold text-foreground">
                      중복 이름 / 다중 세션 확인 ({duplicateNameConflicts.length}명)
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    여러 악기 세션에 등장하는 인물이 동일 인물인지, 동명이인인지 확인합니다.
                  </p>

                  <div className="space-y-2 pt-1">
                    {duplicateNameConflicts.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-lg border border-border bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-bold text-foreground">
                            <strong className="text-primary font-bold">{c.name}</strong> 님이 여러 세션({c.sessions.join(", ")})을 맡고 있습니다. 동일 인물인가요?
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            동일 인물 선택 시 모든 세션을 함께 담당하도록 등록되며, 동명이인 선택 시 각각 개별 인물로 분리됩니다.
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant={c.decision === "same_person" ? "default" : "outline"}
                            onClick={() => {
                              setDuplicateNameConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, decision: "same_person" } : item
                                )
                              );
                            }}
                            className="h-7 text-xs font-semibold"
                          >
                            동일 인물 (세션 합산)
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={c.decision === "homonym" ? "default" : "outline"}
                            onClick={() => {
                              setDuplicateNameConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, decision: "homonym" } : item
                                )
                              );
                            }}
                            className="h-7 text-xs font-semibold"
                          >
                            동명이인 (개별 분리)
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3단계: 부원 DB 동명이인 / 계정 매칭 */}
              {accountMatchConflicts.length > 0 && (
                <div className="space-y-2.5 p-3.5 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <UserCheck className="size-4 text-primary" />
                    <h3 className="text-xs font-bold text-foreground">
                      부원 DB 계정 매칭 ({accountMatchConflicts.length}명)
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    동아리 부원 DB에 동일 이름이 여러 명 있습니다. 연동할 계정을 선택하세요.
                  </p>

                  <div className="space-y-2.5 pt-1">
                    {accountMatchConflicts.map((c) => (
                      <div
                        key={c.id}
                        className="p-3.5 rounded-lg border border-border bg-background space-y-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-foreground">
                            {c.name} 님의 부원 계정을 선택해주세요.
                          </p>
                          <span className="text-[11px] text-muted-foreground">
                            담당 세션: {c.sessionPart}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {c.matchedUsers.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setAccountMatchConflicts((prev) =>
                                  prev.map((item) =>
                                    item.id === c.id ? { ...item, selectedUserId: u.id } : item
                                  )
                                );
                              }}
                              className={cn(
                                "p-2 rounded-lg border text-left transition-all text-xs flex flex-col gap-0.5",
                                c.selectedUserId === u.id
                                  ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground"
                                  : "border-border hover:bg-muted/40 text-muted-foreground"
                              )}
                            >
                              <span className="font-bold text-foreground">
                                {u.generation ? `${u.generation}기 ` : ""}{u.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {u.email || "이메일 없음"} · 주세션: {u.part || "세션"}
                              </span>
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() => {
                              setAccountMatchConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, selectedUserId: "dummy" } : item
                                )
                              );
                            }}
                            className={cn(
                              "p-2 rounded-lg border text-left transition-all text-xs flex flex-col justify-center",
                              c.selectedUserId === "dummy"
                                ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground font-bold"
                                : "border-border hover:bg-muted/40 text-muted-foreground"
                            )}
                          >
                            <span>미연동 (더미 유지)</span>
                            <span className="text-[10px] text-muted-foreground">외부 객원 또는 미가입자</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAccountMatchConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, selectedUserId: "manual" } : item
                                )
                              );
                            }}
                            className={cn(
                              "p-2 rounded-lg border text-left transition-all text-xs flex flex-col justify-center",
                              c.selectedUserId === "manual"
                                ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground font-bold"
                                : "border-border hover:bg-muted/40 text-muted-foreground"
                            )}
                          >
                            <span>직접 입력</span>
                            <span className="text-[10px] text-muted-foreground">기수/이메일 수동 지정</span>
                          </button>
                        </div>

                        {/* 직접 입력 필드 */}
                        {c.selectedUserId === "manual" && (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                            <div>
                              <Label className="text-[10px] text-muted-foreground">기수 (숫자만)</Label>
                              <Input
                                type="number"
                                placeholder="예: 39"
                                value={c.manualInfo?.generation ?? ""}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setAccountMatchConflicts((prev) =>
                                    prev.map((item) =>
                                      item.id === c.id
                                        ? {
                                            ...item,
                                            manualInfo: {
                                              name: item.manualInfo?.name || c.name,
                                              generation: isNaN(val) ? null : val,
                                              email: item.manualInfo?.email || "",
                                            },
                                          }
                                        : item
                                    )
                                  );
                                }}
                                className="h-7 text-xs bg-background"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">이메일 (선택)</Label>
                              <Input
                                type="text"
                                placeholder="example@sokna.com"
                                value={c.manualInfo?.email ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAccountMatchConflicts((prev) =>
                                    prev.map((item) =>
                                      item.id === c.id
                                        ? {
                                            ...item,
                                            manualInfo: {
                                              name: item.manualInfo?.name || c.name,
                                              generation: item.manualInfo?.generation ?? null,
                                              email: val,
                                            },
                                          }
                                        : item
                                    )
                                  );
                                }}
                                className="h-7 text-xs bg-background"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4단계: 보컬 성별 구분 (남보컬 vs 여보컬) */}
              {vocalGenderConflicts.length > 0 && (
                <div className="space-y-2.5 p-3.5 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Music className="size-4 text-primary" />
                    <h3 className="text-xs font-bold text-foreground">
                      보컬 성별 구분 ({vocalGenderConflicts.length}명)
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    보컬 세션을 맡은 인원의 성별 구분을 선택해주세요. (후보곡 매칭 및 셋리스트 분배에 활용됩니다)
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {vocalGenderConflicts.map((c) => (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-lg border border-border bg-background flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-bold text-foreground">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setVocalGenderConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, selectedGender: "남보컬" } : item
                                )
                              );
                            }}
                            className={cn(
                              "px-2 py-1 rounded text-xs font-semibold transition-colors",
                              c.selectedGender === "남보컬"
                                ? "bg-blue-500 text-white font-bold"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            )}
                          >
                            남보컬
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVocalGenderConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, selectedGender: "여보컬" } : item
                                )
                              );
                            }}
                            className={cn(
                              "px-2 py-1 rounded text-xs font-semibold transition-colors",
                              c.selectedGender === "여보컬"
                                ? "bg-rose-500 text-white font-bold"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            )}
                          >
                            여보컬
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVocalGenderConflicts((prev) =>
                                prev.map((item) =>
                                  item.id === c.id ? { ...item, selectedGender: "공통" } : item
                                )
                              );
                            }}
                            className={cn(
                              "px-2 py-1 rounded text-xs font-semibold transition-colors",
                              c.selectedGender === "공통"
                                ? "bg-primary text-primary-foreground font-bold"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            )}
                          >
                            공통
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: 미리보기 및 덮어쓰기 */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* 덮어쓰기 경고 배너 */}
              <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>기존 데이터 덮어쓰기 경고</span>
                </div>
                <p className="leading-relaxed">
                  확인 버튼을 누르면 현재 폼에 등록된{" "}
                  <strong>
                    {parsedData.format === "session_distribution"
                      ? `셋리스트 (${existingSetlistsCount}곡)와 공연자 명단 (${existingPerformersCount}명)`
                      : `공연자 명단 (${existingPerformersCount}명)`}
                  </strong>
                  이 모두 삭제되고, 아래 미리보기의 새 데이터로 완전히 교체(덮어쓰기)됩니다.
                </p>
              </div>

              {/* 셋리스트 미리보기 요약 (세션 분배표일 때) */}
              {parsedData.format === "session_distribution" && (
                <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <ListMusic className="size-3.5 text-primary" />
                      생성될 셋리스트 목록 ({resolvedData.setlists.length}곡)
                    </h4>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                    {resolvedData.setlists.map((s, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-background border border-border text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="size-5 rounded bg-muted text-muted-foreground font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                            #{s.order_num}
                          </span>
                          <span className="font-bold text-foreground truncate">{s.title}</span>
                          {s.artist && (
                            <span className="text-muted-foreground text-[11px] truncate">
                              ({s.artist})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          슬롯 생성 완료
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 공연자 미리보기 요약 */}
              <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Users className="size-3.5 text-primary" />
                    등록될 공연자 명단 ({resolvedData.performers.length}명)
                  </h4>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {resolvedData.performers.map((p, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-background border border-border shadow-2xs"
                    >
                      <span className="font-bold text-foreground">
                        {p.generation ? `${p.generation}기 ` : ""}{p.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 font-normal">
                        {p.part}
                      </Badge>
                      {p.id && (!p.email || !p.email.startsWith("temp-")) ? (
                        <span className="size-1.5 rounded-full bg-emerald-500" title="계정 연동 완료" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-amber-500" title="더미 공연자" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. 모달 하단 액션 버튼 바 */}
        <div className="p-4 border-t border-border/80 flex items-center justify-between gap-2 bg-muted/20">
          <div>
            {step !== "paste" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (step === "preview") {
                    const totalConflictsCount =
                      sessionMismatchConflicts.length +
                      nonMemberConflicts.length +
                      duplicateNameConflicts.length +
                      accountMatchConflicts.length +
                      vocalGenderConflicts.length;
                    setStep(totalConflictsCount > 0 ? "conflicts" : "paste");
                  } else if (step === "conflicts") {
                    setStep("paste");
                  }
                }}
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                이전
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs font-semibold"
            >
              취소
            </Button>

            {step === "paste" && (
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={!pasteText.trim() || isAnalyzing}
                onClick={handleProceedFromPaste}
                className="h-8 text-xs font-bold gap-1.5"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    분석 중...
                  </>
                ) : (
                  <>
                    다음
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            )}

            {step === "conflicts" && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setStep("preview")}
                className="h-8 text-xs font-bold gap-1.5"
              >
                미리보기 확인
                <ArrowRight className="size-3.5" />
              </Button>
            )}

            {step === "preview" && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmApply}
                className="h-8 text-xs font-bold gap-1.5 shadow-sm"
              >
                <Check className="size-3.5" />
                기존 내역 삭제 후 덮어쓰기 적용
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
