export interface IncomingGigPerformer {
  performerId?: number;
  id?: string;
  name: string;
  email?: string;
  part?: string | null;
  photo_url?: string | null;
}

export interface StoredGigPerformer {
  id: number;
  user_id: string | null;
  name: string | null;
  part: string;
  photo_url: string | null;
}

type PerformerValues = {
  user_id: string | null;
  name: string;
  part: string;
  photo_url: string | null;
};

function normalizePerformerParts(value: string | null | undefined): string {
  return [...new Set((value || "세션")
    .split(",")
    .map((part) => part.trim().replaceAll("키보드", "건반"))
    .filter(Boolean))].join(", ") || "세션";
}

export function mergeLinkedGigPerformers<T extends IncomingGigPerformer>(performers: T[]): T[] {
  const merged: T[] = [];
  const linkedIndices = new Map<string, number>();
  for (const performer of performers) {
    const normalized = {
      ...performer,
      part: normalizePerformerParts(performer.part),
    } as T;
    const userId = performer.id && !performer.email?.startsWith("temp-")
      ? performer.id
      : null;
    const existingIndex = userId ? linkedIndices.get(userId) : undefined;
    if (existingIndex === undefined) {
      if (userId) linkedIndices.set(userId, merged.length);
      merged.push(normalized);
      continue;
    }
    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      performerId: existing.performerId ?? normalized.performerId,
      part: normalizePerformerParts([existing.part, normalized.part].join(", ")),
      photo_url: existing.photo_url || normalized.photo_url,
    };
  }
  return merged;
}

export type GigPerformerPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      toUpdate: (PerformerValues & { id: number })[];
      toInsert: (PerformerValues & { gig_id: number })[];
      toDelete: { id: number; replacementId: number | null }[];
    };

export function planGigPerformerChanges(
  gigId: number,
  incoming: IncomingGigPerformer[],
  existing: StoredGigPerformer[]
): GigPerformerPlan {
  const validIncoming = incoming.filter((p) => p.name.trim());
  const incomingUserIds = new Set<string>();
  for (const p of validIncoming) {
    if (p.id && !p.email?.startsWith("temp-")) {
      if (incomingUserIds.has(p.id)) {
        return { ok: false, error: "동일한 회원 계정이 공연자 명단에 중복되어 있습니다." };
      }
      incomingUserIds.add(p.id);
    }
  }

  const remaining = [...existing];
  const toUpdate: (PerformerValues & { id: number })[] = [];
  const toInsert: (PerformerValues & { gig_id: number })[] = [];
  const survivorByUserId = new Map<string, number>();

  for (const p of validIncoming) {
    const linked = Boolean(p.id && !p.email?.startsWith("temp-"));
    const values: PerformerValues = {
      user_id: linked ? p.id! : null,
      name: p.name.trim(),
      part: normalizePerformerParts(p.part),
      photo_url: p.photo_url || null,
    };
    let matchedIdx = -1;

    if (p.performerId !== undefined) {
      if (!Number.isInteger(p.performerId) || p.performerId <= 0) {
        return { ok: false, error: "공연자 행 ID가 올바르지 않습니다." };
      }
      matchedIdx = remaining.findIndex((ep) => ep.id === p.performerId);
      if (matchedIdx === -1) {
        return { ok: false, error: "공연자 명단이 변경되었습니다. 새로고침 후 다시 시도해주세요." };
      }
    } else if (values.user_id) {
      matchedIdx = remaining.findIndex((ep) => ep.user_id === values.user_id);
      if (matchedIdx === -1) {
        matchedIdx = remaining.findIndex(
          (ep) => ep.user_id === null && ep.name === values.name
        );
      }
    } else {
      matchedIdx = remaining.findIndex(
        (ep) => ep.user_id === null && ep.name === values.name
      );
    }

    if (matchedIdx === -1) {
      toInsert.push({ gig_id: gigId, ...values });
      continue;
    }

    const matched = remaining.splice(matchedIdx, 1)[0];
    if (values.user_id) survivorByUserId.set(values.user_id, matched.id);
    if (
      matched.user_id !== values.user_id ||
      matched.name !== values.name ||
      matched.part !== values.part ||
      matched.photo_url !== values.photo_url
    ) {
      toUpdate.push({ id: matched.id, ...values });
    }
  }

  return {
    ok: true,
    toUpdate,
    toInsert,
    toDelete: remaining.map((ep) => ({
      id: ep.id,
      replacementId: ep.user_id
        ? survivorByUserId.get(ep.user_id) ?? null
        : null,
    })),
  };
}
