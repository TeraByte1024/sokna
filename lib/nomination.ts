export interface NominationTimestamp {
  id?: string;
  time: string;
  label: string;
}

export interface NominationLink {
  url: string;
  note?: string;
  timestamp?: string;
  timestamps?: NominationTimestamp[];
}

export interface RecommendedVocal {
  id: number;
  name: string;
  generation?: number | null;
  part?: string;
  userId?: string | null;
}

export type NominationResponseStatus = "available" | "undecided" | "unavailable";

export interface NominationResponse {
  id: number;
  nominationId: number;
  userId: string;
  sessionPart: string;
  status: NominationResponseStatus;
  comment: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    name: string;
    generation: number | null;
    part: string | null;
  } | null;
}

export interface Nomination {
  id: number;
  gigId: number;
  title: string;
  artist: string;
  requiredParts: string[];
  recommendedVocals: RecommendedVocal[];
  sheetExists: boolean;
  sheetNote?: string;
  description: string;
  updatedAt: string;
  createdAt: string;
  orderNum: number;
  createdBy: {
    name: string;
    part: string;
    generation: number | null;
    userId?: string | null;
    performerId?: number | null;
  } | null;
  links: NominationLink[];
  responses?: NominationResponse[];
}

export type NominationFormValues = Pick<
  Nomination,
  "title" | "artist" | "requiredParts" | "recommendedVocals" | "sheetExists" | "description" | "links"
> & {
  sheetNote?: string;
};

// 하위 호환성을 위한 Setlist 별칭
export type Setlist = Nomination;
export type SetlistFormValues = NominationFormValues;
export type SetlistLink = NominationLink;

export function parseNomination(row: any): Nomination {
  // links (Json | null) 안전하게 파싱
  const rawRefs = row.links as unknown as NominationLink[] | null;
  const safeLinks: NominationLink[] = Array.isArray(rawRefs)
    ? rawRefs.map((link: any) => {
        if (typeof link === "string") {
          return {
            url: link.trim(),
            note: "",
            timestamp: "",
            timestamps: [],
          };
        }
        // timestamps 안전 파싱
        const rawTimestamps = link?.timestamps;
        const safeTimestamps: NominationTimestamp[] = Array.isArray(rawTimestamps)
          ? rawTimestamps
              .map((t: any) => ({
                id: t.id ? String(t.id) : undefined,
                time: String(t.time || "").trim(),
                label: String(t.label || "").trim(),
              }))
              .filter((t) => t.time.length > 0)
          : link?.timestamp
            ? [{ time: String(link.timestamp).trim(), label: "" }]
            : [];

        return {
          url: (link?.url || "").trim(),
          note: link?.note || "",
          timestamp: link?.timestamp || "",
          timestamps: safeTimestamps,
        };
      })
    : [];

  // recommended_vocals (Json | null) 안전하게 파싱
  const rawVocals = row.recommended_vocals as unknown as RecommendedVocal[] | null;
  const safeVocals: RecommendedVocal[] = Array.isArray(rawVocals)
    ? rawVocals.map((v) => ({
        id: Number(v.id),
        name: v.name || "",
        generation: v.generation ?? null,
        part: v.part || "",
      }))
    : [];

  // 중첩된 조인 데이터(performers -> users) 추출
  const createdBy = row.created_by_performer || row.created_by;
  const safeCreatedBy = createdBy && typeof createdBy === "object"
    ? {
        name: createdBy.users?.name || createdBy.name || "익명",
        part: createdBy.part || "미지정",
        generation:
          createdBy.users?.generation !== undefined && createdBy.users?.generation !== null
            ? Number(createdBy.users.generation)
            : createdBy.generation
              ? Number(createdBy.generation)
              : null,
        userId: createdBy.user_id || null,
        performerId: Number(createdBy.id || (typeof row.created_by === "number" ? row.created_by : null)) || null,
      }
    : null;

  // responses (nomination_responses) 매핑
  const rawResponses = (row.responses || row.nomination_responses) as any[] | null;
  const safeResponses: NominationResponse[] = Array.isArray(rawResponses)
    ? rawResponses.map((r) => ({
        id: Number(r.id),
        nominationId: Number(r.nomination_id || row.id),
        userId: r.user_id,
        sessionPart: r.session_part || "",
        status: (r.status || "undecided") as NominationResponseStatus,
        comment: r.comment || "",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        user: r.users
          ? {
              name: r.users.name || "익명",
              generation: r.users.generation ?? null,
              part: r.users.part || null,
            }
          : null,
      }))
    : [];

  return {
    id: row.id,
    gigId: row.gig_id,
    title: row.title ?? "",
    artist: row.artist ?? "",
    requiredParts: row.required_parts ?? [],
    recommendedVocals: safeVocals,
    sheetExists: row.sheet_exists ?? false,
    sheetNote: row.sheet_note || "",
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    orderNum: row.order_num ?? 0,
    createdBy: safeCreatedBy,
    links: safeLinks,
    responses: safeResponses,
  };
}

export const parseSetlist = parseNomination;

export function defaultRequiredParts(): string[] {
  return ["보컬(남)", "보컬(여)", "기타", "베이스", "드럼", "건반"];
}

export function isMaleVocalPart(part: string): boolean {
  return part.includes("보컬(남)") || part.includes("남보컬");
}

export function isFemaleVocalPart(part: string): boolean {
  return part.includes("보컬(여)") || part.includes("여보컬");
}

/**
 * 공연 참여자의 세션 파트가 특정 필요 세션 파트와 매칭되는지 판별
 */
export function isPerformerMatchingSessionPart(
  performerPart: string | undefined | null,
  sessionPart: string,
): boolean {
  if (!performerPart) return false;
  const p = performerPart.trim().toLowerCase();
  const s = sessionPart.trim().toLowerCase();

  // 1. 완전 일치
  if (p === s) return true;

  // 2. 보컬(남) / 남보컬
  if (s.includes("보컬(남)") || s.includes("남보컬")) {
    if (isMaleVocalPart(p)) return true;
    if (p === "보컬" || p === "vocal") return true;
    return false;
  }

  // 3. 보컬(여) / 여보컬
  if (s.includes("보컬(여)") || s.includes("여보컬")) {
    if (isFemaleVocalPart(p)) return true;
    if (p === "보컬" || p === "vocal") return true;
    return false;
  }

  // 4. 일반 보컬
  if (s.includes("보컬") || s.includes("vocal")) {
    return p.includes("보컬") || p.includes("vocal");
  }

  // 5. 기타
  if (s.includes("기타") || s.includes("guitar")) {
    return (
      p.includes("기타") ||
      p.includes("guitar") ||
      p.includes("일렉") ||
      p.includes("통기타") ||
      p === "e.g" ||
      p === "a.g"
    );
  }

  // 6. 베이스
  if (s.includes("베이스") || s.includes("bass")) {
    return p.includes("베이스") || p.includes("bass") || p === "b";
  }

  // 7. 드럼
  if (s.includes("드럼") || s.includes("drum")) {
    return p.includes("드럼") || p.includes("drum") || p === "d";
  }

  // 8. 건반 / 키보드 / 피아노 / 신디
  if (
    s.includes("건반") ||
    s.includes("키보드") ||
    s.includes("피아노") ||
    s.includes("신디") ||
    s.includes("keyboard") ||
    s.includes("piano") ||
    s.includes("synth")
  ) {
    return (
      p.includes("건반") ||
      p.includes("키보드") ||
      p.includes("피아노") ||
      p.includes("신디") ||
      p.includes("keyboard") ||
      p.includes("piano") ||
      p.includes("synth")
    );
  }

  // 9. 코러스
  if (s.includes("코러스") || s.includes("chorus")) {
    return p.includes("코러스") || p.includes("chorus");
  }

  // 10. 상호 포함 여부
  return p.includes(s) || s.includes(p);
}

/**
 * mm:ss 또는 hh:mm:ss 형식의 텍스트에서 초(seconds) 추출
 * 예: "01:23" -> 83, "1:05:20" -> 3920
 */
export function parseTimestampToSeconds(text: string): number | null {
  if (!text) return null;
  const match = text.match(/(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}))/);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * 유튜브 URL의 ?t= 또는 &start= 쿼리에서 초(seconds) 추출
 */
export function extractYouTubeTimestamp(url?: string | null): number | null {
  if (!url) return null;
  const tMatch = url.match(/[?&](?:t|start)=([^&#]+)/i);
  if (!tMatch) return null;
  const val = tMatch[1];
  if (/^\d+s?$/i.test(val)) {
    return parseInt(val.replace("s", ""), 10);
  }
  const mMatch = val.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  if (mMatch) {
    const h = mMatch[1] ? parseInt(mMatch[1], 10) : 0;
    const m = mMatch[2] ? parseInt(mMatch[2], 10) : 0;
    const s = mMatch[3] ? parseInt(mMatch[3], 10) : 0;
    if (h || m || s) return h * 3600 + m * 60 + s;
  }
  return null;
}

export function partCounts(parts: string[]): Record<string, number> {
  return parts.reduce(
    (acc, part) => {
      acc[part] = (acc[part] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * 타임스탬프 표기에서 선행 0을 제거(strip)하여 자연스럽게 포맷팅
 * 예: "01:23" -> "1:23", "00:45" -> "0:45", "00:00" -> "0:00", "01:23 ~ 02:45" -> "1:23 ~ 2:45"
 *     "01:05:20" -> "1:05:20", "00:05:20" -> "5:20"
 */
export function stripLeadingZeroTime(timeStr: string): string {
  if (!timeStr) return "";
  return timeStr
    .split("~")
    .map((part) => {
      const trimmed = part.trim();
      const colons = trimmed.split(":");
      if (colons.length === 3) {
        const h = parseInt(colons[0], 10);
        const m = parseInt(colons[1], 10);
        const s = colons[2].padStart(2, "0");
        if (h > 0) {
          return `${h}:${m.toString().padStart(2, "0")}:${s}`;
        }
        return `${isNaN(m) ? "0" : m}:${s}`;
      } else if (colons.length === 2) {
        const m = parseInt(colons[0], 10);
        const s = colons[1].padStart(2, "0");
        return `${isNaN(m) ? "0" : m}:${s}`;
      }
      return trimmed;
    })
    .join(" ~ ");
}

/**
 * 유튜브 URL에서 11자리 비디오 ID 추출
 */
export function getYouTubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?.*v=|shorts\/|live\/))([\w-]{11})/i,
  );
  return match ? match[1] : null;
}

/**
 * 유튜브 썸네일 이미지 URL 생성
 */
export function getYouTubeThumbnailUrl(videoId?: string | null): string | null {
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * 안전한 외부 링크 URL 생성 (http/https 보장)
 */
export function formatExternalLink(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;
}

/**
 * 세션 파트 정렬 우선순위:
 * 보컬 > 코러스 > 기타 > 베이스 > 드럼 > 건반 > 이외
 */
export function getSessionPartOrder(part: string): number {
  const p = part.trim().toLowerCase();
  if (p.includes("보컬")) {
    if (p.includes("남")) return 10;
    if (p.includes("여")) return 11;
    return 12;
  }
  if (p.includes("코러스")) return 20;
  if (p.includes("기타") || p.includes("guitar")) return 30;
  if (p.includes("베이스") || p.includes("bass")) return 40;
  if (p.includes("드럼") || p.includes("drum")) return 50;
  if (
    p.includes("건반") ||
    p.includes("키보드") ||
    p.includes("피아노") ||
    p.includes("신디") ||
    p.includes("piano") ||
    p.includes("keyboard") ||
    p.includes("synth")
  ) {
    return 60;
  }
  return 100;
}

export function sortSessionParts(parts: string[]): string[] {
  return [...parts].sort((a, b) => {
    const orderA = getSessionPartOrder(a);
    const orderB = getSessionPartOrder(b);
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b, "ko-KR");
  });
}

export const sortParts = sortSessionParts;
export const getPartOrder = getSessionPartOrder;

/**
 * 초(seconds)를 mm:ss 또는 hh:mm:ss 포맷 문자열로 변환
 */
export function formatSecondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export interface ParsedTimestampItem {
  type: "range" | "single";
  raw: string;
  startSeconds: number;
  endSeconds?: number;
  label?: string;
  startIndex: number;
  endIndex: number;
}

/**
 * 텍스트에서 구간(01:23 ~ 02:45, 1:23-2:45 등) 및 단일 타임스탬프(01:23 등)를 추출.
 * 구간 입력이 단일 타임스탬프보다 우선하여 하나의 뱃지로 묶임.
 */
export function parseTimestampsAndRanges(text?: string | null): ParsedTimestampItem[] {
  if (!text) return [];

  const items: ParsedTimestampItem[] = [];
  const occupiedRanges: { start: number; end: number }[] = [];

  // 1. 구간(Range) 패턴 우선 매칭
  const rangeRegex = /(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}))\s*(?:~|-|–|to)\s*(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}))/gi;
  let match: RegExpExecArray | null;

  while ((match = rangeRegex.exec(text)) !== null) {
    const raw = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + raw.length;

    const subParts = raw.split(/\s*(?:~|-|–|to)\s*/i);
    if (subParts.length >= 2) {
      const startSec = parseTimestampToSeconds(subParts[0]);
      const endSec = parseTimestampToSeconds(subParts[1]);

      if (startSec !== null) {
        items.push({
          type: "range",
          raw: raw.trim(),
          startSeconds: startSec,
          endSeconds: endSec ?? undefined,
          startIndex,
          endIndex,
        });
        occupiedRanges.push({ start: startIndex, end: endIndex });
      }
    }
  }

  // 2. 단일 타임스탬프 패턴 매칭 (이미 구간에 포함된 범위는 건너뜀)
  const singleRegex = /(?:(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}))/g;
  while ((match = singleRegex.exec(text)) !== null) {
    const raw = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + raw.length;

    const isOccupied = occupiedRanges.some(
      (r) => startIndex >= r.start && endIndex <= r.end,
    );

    if (!isOccupied) {
      const sec = parseTimestampToSeconds(raw);
      if (sec !== null) {
        items.push({
          type: "single",
          raw,
          startSeconds: sec,
          startIndex,
          endIndex,
        });
      }
    }
  }

  items.sort((a, b) => a.startIndex - b.startIndex);

  // 주변 부가 설명 라벨 추출
  items.forEach((item, idx) => {
    const nextStart = idx < items.length - 1 ? items[idx + 1].startIndex : text.length;
    const followingText = text.slice(item.endIndex, nextStart).trim();
    const labelMatch = followingText.split(/[,;\n\r]/)[0].trim();
    if (labelMatch) {
      item.label = labelMatch.slice(0, 30);
    }
  });

  return items;
}

/**
 * 자주 쓰는 기본 세션 프리셋 (보컬, 기타, 베이스, 드럼, 건반)
 */
export const DEFAULT_PRESET_SESSIONS = [
  "보컬",
  "기타",
  "베이스",
  "드럼",
  "건반",
];

/**
 * 특정 세션 파트가 공연 전체 참여자에게 할당된 세션 풀에 없는 로컬 커스텀 세션인지 판별
 */
export function isLocalCustomSession(
  sessionPart: string,
  gigAssignedSessions: string[],
): boolean {
  const hasPerformerWithPart = gigAssignedSessions.some((assigned) =>
    isPerformerMatchingSessionPart(assigned, sessionPart),
  );
  return !hasPerformerWithPart;
}

export interface EligibleSession {
  sessionPart: string;
  isLocalCustom: boolean;
  isRecommendedVocal: boolean;
  existingResponse?: NominationResponse;
}

/**
 * 특정 후보곡에 대해 사용자가 응답 가능한 세션 목록 도출
 * - 배정 세션 일치자
 * - 보컬인 경우 추천 보컬 지목자
 * - 로컬 커스텀 세션인 경우 모든 공연 참여자
 */
export function getEligibleSessionsForUser(
  song: Nomination,
  performers: RecommendedVocal[],
  currentUserId?: string | null,
): EligibleSession[] {
  if (!currentUserId) return [];

  // 1. 현재 사용자의 공연자 정보 조회 (userId 기준)
  const currentPerformer = performers.find((p) => p.userId === currentUserId);
  if (!currentPerformer) return [];

  // 2. 공연 전체 참여자에게 부여된 세션 파트 목록
  const allAssignedParts = performers.flatMap((p) =>
    (p.part || "").split(",").map((s) => s.trim()).filter(Boolean),
  );

  // 3. 곡의 고유 필요 세션 목록
  const uniqueRequiredParts = Array.from(new Set(song.requiredParts || []));
  const eligible: EligibleSession[] = [];

  uniqueRequiredParts.forEach((part) => {
    const isRec = Boolean(
      part.includes("보컬") &&
        song.recommendedVocals?.some((v) => v.userId === currentUserId),
    );
    const isAssigned = isPerformerMatchingSessionPart(currentPerformer.part, part);
    const isLocalCustom = isLocalCustomSession(part, allAssignedParts);

    // 배정된 세션이거나, 추천 보컬이거나, 로컬 커스텀 세션인 경우 응답 가능
    if (isAssigned || isRec || isLocalCustom) {
      const existingResponse = song.responses?.find(
        (r) => r.userId === currentUserId && r.sessionPart === part,
      );
      eligible.push({
        sessionPart: part,
        isLocalCustom,
        isRecommendedVocal: isRec,
        existingResponse,
      });
    }
  });

  return eligible;
}
