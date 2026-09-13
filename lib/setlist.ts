export interface SetlistLink {
  url: string;
  note?: string;
}

export interface Setlist {
  id: number;
  gigId: number;
  title: string;
  artist: string;
  requiredParts: string[];
  sheetExists: boolean;
  description: string;
  updatedAt: string;
  createdAt: string;
  orderNum: number;
  createdBy: {
    name: string;
    part: string;
    generation: number;
    userId?: string | null;
  } | null;
  links: SetlistLink[];
}

export type SetlistFormValues = Pick<
  Setlist,
  "title" | "artist" | "requiredParts" | "sheetExists" | "description" | "links"
>;

export function parseSetlist(row: any): Setlist {
  // links (Json | null) 안전하게 파싱
  const rawRefs = row.links as unknown as SetlistLink[] | null;
  const safeLinks: SetlistLink[] = Array.isArray(rawRefs)
    ? rawRefs.map((link) => ({
        url: link.url || "",
        note: link.note || "",
      }))
    : [];

  // 중첩된 조인 데이터(performers -> users) 추출
  // row.created_by: { part, generation, name: { name }, user_id } 구조 대응
  const createdBy = row.created_by_performer || row.created_by;
  const safeCreatedBy = createdBy && typeof createdBy === "object"
    ? {
        name: createdBy.name || "익명",
        part: createdBy.part || "미지정",
        generation: createdBy.generation || 0,
        userId: createdBy.user_id || null,
      }
    : null;

  return {
    id: row.id,
    gigId: row.gig_id,
    title: row.title ?? "",
    artist: row.artist ?? "",
    requiredParts: row.required_parts ?? [],
    sheetExists: row.sheet_exists ?? false,
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    orderNum: row.order_num ?? 0,
    createdBy: safeCreatedBy,
    links: safeLinks,
  };
}


export function defaultRequiredParts(): string[] {
  return ["보컬", "기타", "베이스", "드럼", "건반"];
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