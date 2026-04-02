export type Gig = {
  id: string;
  title: string;
  perform_date: string | null;
  meeting_date: string | null;
  performers: string;
  created_at: string;
  updated_at: string;
};

export function mapGigRow(row: Record<string, unknown>): Gig {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    perform_date:
      row.perform_date == null || row.perform_date === ""
        ? null
        : String(row.perform_date),
    meeting_date:
      row.meeting_date == null || row.meeting_date === ""
        ? null
        : String(row.meeting_date),
    performers: String(row.performers ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}
