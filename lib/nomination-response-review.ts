import type { NominationResponse } from "@/lib/nomination";

export function isNominationResponseOutdated(
  nominationUpdatedAt: string | null | undefined,
  response: Pick<NominationResponse, "updatedAt"> | null | undefined,
): boolean {
  if (!nominationUpdatedAt || !response?.updatedAt) return false;
  const nominationTime = Date.parse(nominationUpdatedAt);
  const responseTime = Date.parse(response.updatedAt);
  return Number.isFinite(nominationTime) && Number.isFinite(responseTime) && nominationTime > responseTime;
}

interface NominationContent {
  title?: string | null;
  artist?: string | null;
  required_parts?: string[] | null;
  sheet_exists?: boolean | null;
  sheet_note?: string | null;
  description?: string | null;
  links?: unknown;
  recommended_vocals?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizeContent(content: NominationContent) {
  return {
    title: content.title || "",
    artist: content.artist || "",
    requiredParts: content.required_parts || [],
    sheetExists: content.sheet_exists ?? false,
    sheetNote: content.sheet_note || "",
    description: content.description || "",
    links: Array.isArray(content.links) ? content.links.map((value: unknown) => {
      const link: Record<string, unknown> = typeof value === "string" ? { url: value } : record(value);
      const timestamps = Array.isArray(link.timestamps)
        ? link.timestamps
        : link.timestamp ? [{ time: link.timestamp, label: "" }] : [];
      return {
        url: String(link.url || "").trim(),
        note: String(link.note || ""),
        timestamps: timestamps.map((value: unknown) => {
          const timestamp = record(value);
          return { time: String(timestamp.time || "").trim(), label: String(timestamp.label || "").trim() };
        }).filter(({ time }) => time.length > 0),
      };
    }) : [],
    recommendedVocals: Array.isArray(content.recommended_vocals) ? content.recommended_vocals.map((value: unknown) => {
      const vocal = record(value);
      return {
        id: Number(vocal.id),
        name: String(vocal.name || ""),
        generation: vocal.generation ?? null,
        part: String(vocal.part || ""),
      };
    }) : [],
  };
}

export function hasNominationContentChanged(current: NominationContent, next: NominationContent): boolean {
  return JSON.stringify(normalizeContent(current)) !== JSON.stringify(normalizeContent(next));
}
