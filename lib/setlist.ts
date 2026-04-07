import { Tables } from "@/lib/supabase/database.types";

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
	createdBy: string;
	links: SetlistLink[];
}

export type SetlistFormValues = Pick<
  Setlist,
  "title" | "artist" | "requiredParts" | "sheetExists" | "description" | "links"
>;

export function parseSetlist(row: Tables<"setlists">): Setlist {
	// 1. links (Json | null) 안전하게 파싱
	const rawRefs = row.links as unknown as SetlistLink[] | null;
	const safeLinks: SetlistLink[] = Array.isArray(rawRefs)
		? rawRefs.map((link) => ({
				url: link.url || "",
				note: link.note || "",
			}))
		: [];

	return {
		id: row.id,
		gigId: row.gig_id,
		title: row.title ?? "",
		artist: row.artist ?? "",
		requiredParts: row.required_parts ?? [],
		sheetExists: row.sheet_exists ?? false, // 악보 존재 여부 (기본값 false)
		description: row.description ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at ?? row.created_at, // updatedAt이 null일 경우 createdAt을 기본값으로 사용
		createdBy: row.created_by,
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
