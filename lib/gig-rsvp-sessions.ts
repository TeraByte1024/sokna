/** RSVP와 공연자 파트에서 사용하는 쉼표 구분 세션 목록을 정규화합니다. */
export function parseGigRsvpSessions(value: string | readonly string[] | null | undefined): string[] {
  const values = typeof value === "string" ? [value] : value ?? [];
  const parts = values.flatMap((entry) =>
    entry.split(",").map((part) => part.trim().replaceAll("키보드", "건반")).filter(Boolean)
  );
  return Array.from(new Set(parts));
}
