export const SESSION_SLOTS = [
  { key: "vocal", label: "보컬" },
  { key: "guitar", label: "기타" },
  { key: "bass", label: "베이스" },
  { key: "drums", label: "드럼" },
  { key: "keyboard", label: "건반" },
  { key: "other", label: "이외" },
] as const;

export type SessionKey = (typeof SESSION_SLOTS)[number]["key"];
export type PartConfigs = Record<SessionKey, number>;

export const SESSION_COUNT_MAX = 99;

export function defaultPartConfigs(): PartConfigs {
  return { vocal: 1, guitar: 1, bass: 1, drums: 1, keyboard: 1, other: 0 };
}

export type SetlistLink = {
  youtubeUrl: string;
  segmentNote?: string;
};

export type Setlist = {
  id: string;
  gigId: string;
  title: string;
  artist: string;
  partConfigs: PartConfigs;
  description: string;
  links: SetlistLink[];
  createdAt: string;
  createdBy: string;
};

/**
 * DB Row -> Setlist 타입 변환
 */
export function mapSetlistRow(row: Record<string, any>): Setlist {
  return {
    id: row.id,
    gigId: row.gig_id,
    title: row.title || "",
    artist: row.artist || "",
    description: row.description || "",
    createdAt: row.created_at,
    createdBy: row.created_by,
    partConfigs: parsePartConfigs(row.part_config),
    links: parseLinks(row.references),
  };
}

function parsePartConfigs(raw: unknown): PartConfigs {
  const base = defaultPartConfigs();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, any>;
  (Object.keys(base) as SessionKey[]).forEach((k) => {
    const n = Number(o[k]);
    if (Number.isFinite(n) && n >= 0) base[k] = Math.min(SESSION_COUNT_MAX, Math.floor(n));
  });
  return base;
}

function parseLinks(raw: unknown): SetlistLink[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item): SetlistLink[] => {
    if (!item || typeof item !== "object") return [];
    
    const youtubeUrl = String((item as any).youtubeUrl || "").trim();
    if (!youtubeUrl) return []; // url이 없으면 제외

    return [{
      youtubeUrl,
      segmentNote: (item as any).segmentNote 
        ? String((item as any).segmentNote).trim() 
        : undefined,
    }];
  });
}