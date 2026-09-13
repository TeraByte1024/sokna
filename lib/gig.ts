export type Gig = {
  id: number;
  title: string;
  subtitle?: string | null;
  perform_date: string | null;
  meeting_date: string | null;
  location: string | null;
  poster_url: string | null;
  is_public: boolean;
  created_at: string;
};

export interface SessionSlot {
  sessionName: string;
  members: string[];
}

export type GigPerformer = {
  id: number;
  part: string;
  user_id: string | null;
  name?: string | null;
  photo_url: string | null;
  user: {
    name: string;
    generation: number | null;
  } | null;
};

/**
 * 셋리스트 session_members 파서
 * JSON 배열 형식([{"sessionName": "...", "members": [...] }])을 우선 파싱하며,
 * 레거시 문자열 형식(예: "홍길동(보컬), 김철수(기타)")도 호환 파싱합니다.
 */
export function parseSessionSlots(raw: string | null | undefined): SessionSlot[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();

  // 1. JSON 형식 시도
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item === "object" && typeof item.sessionName === "string")
          .map((item) => ({
            sessionName: String(item.sessionName).trim(),
            members: Array.isArray(item.members)
              ? item.members.map((m: unknown) => String(m).trim()).filter(Boolean)
              : [],
          }));
      }
    } catch {
      // JSON 파싱 실패 시 레거시 문자열 파싱으로 폴백
    }
  }

  // 2. 레거시 쉼표 구분 문자열 호환 파싱 (예: "홍길동(보컬), 김철수(기타)")
  const slotsMap = new Map<string, string[]>();
  const items = trimmed.split(",").map((s) => s.trim()).filter(Boolean);

  for (const item of items) {
    // "이름(파트)" 패턴 매칭
    const match = item.match(/^([^(]+)\(([^)]+)\)$/);
    if (match) {
      const name = match[1].trim();
      const part = match[2].trim();
      const existing = slotsMap.get(part) || [];
      if (!existing.includes(name)) {
        existing.push(name);
      }
      slotsMap.set(part, existing);
    } else {
      // 파트 괄호가 없는 경우 "세션" 또는 기본 슬롯에 추가
      const existing = slotsMap.get("세션") || [];
      if (!existing.includes(item)) {
        existing.push(item);
      }
      slotsMap.set("세션", existing);
    }
  }

  return Array.from(slotsMap.entries()).map(([sessionName, members]) => ({
    sessionName,
    members,
  }));
}

/**
 * SessionSlot 배열을 DB 저장을 위한 JSON 문자열로 직렬화
 */
export function serializeSessionSlots(slots: SessionSlot[]): string {
  const validSlots = slots
    .filter((s) => s && s.sessionName && s.sessionName.trim().length > 0)
    .map((s) => ({
      sessionName: s.sessionName.trim(),
      members: s.members.map((m) => m.trim()).filter(Boolean),
    }));

  return JSON.stringify(validSlots);
}

export type GigRsvpStatus = "going" | "not_going" | "undecided";

export type GigRsvp = {
  id: number;
  gig_id: number;
  user_id: string;
  status: GigRsvpStatus;
  part: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    name: string;
    generation: number | null;
    email?: string | null;
  } | null;
};

export type GigSetlistPreview = {
  id: number;
  title: string | null;
  artist: string | null;
  required_parts: string[] | null;
  sheet_exists: boolean | null;
  description: string | null;
};

export type GigDetail = {
  gig: Gig;
  performers: GigPerformer[];
  setlists: GigSetlistPreview[];
  rsvps?: GigRsvp[];
};

export function mapGigRow(row: Record<string, unknown>): Gig {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    subtitle:
      row.subtitle == null || row.subtitle === ""
        ? null
        : String(row.subtitle),
    perform_date:
      row.perform_date == null || row.perform_date === ""
        ? null
        : String(row.perform_date),
    meeting_date:
      row.meeting_date == null || row.meeting_date === ""
        ? null
        : String(row.meeting_date),
    location:
      row.location == null || row.location === ""
        ? null
        : String(row.location),
    poster_url:
      row.poster_url == null || row.poster_url === ""
        ? null
        : String(row.poster_url),
    is_public: row.is_public !== false,
    created_at: String(row.created_at ?? ""),
  };
}
