export type GigVisibility = "private" | "members" | "public";

export const GIG_VISIBILITY_LABELS: Record<GigVisibility, string> = {
  private: "비공개",
  members: "회원 공개",
  public: "전체 공개",
};

export function isGigVisibility(value: unknown): value is GigVisibility {
  return value === "private" || value === "members" || value === "public";
}

/** 기존 is_public=false 공연은 회원 공개로 유지합니다. */
export function getGigVisibility(row: { visibility?: unknown; is_public?: unknown }): GigVisibility {
  if (isGigVisibility(row.visibility)) return row.visibility;
  if (row.visibility != null) return "private";
  return row.is_public === true ? "public" : "members";
}

export function canViewGig(
  visibility: GigVisibility,
  viewer: { isLoggedIn: boolean; isAdmin: boolean },
): boolean {
  if (visibility === "public") return true;
  if (!viewer.isLoggedIn) return false;
  return visibility === "members" || viewer.isAdmin;
}
