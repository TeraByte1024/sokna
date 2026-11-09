import { Download } from "lucide-react";
import { ReservationList } from "@/components/tickets/reservation-list";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { Button } from "@/components/ui/button";
import { parseTicketListFilter } from "@/lib/ticket-reservations";
import { ticketClient } from "@/lib/ticket-server";

export const metadata = { title: "예매 관리", robots: { index: false, follow: false } };

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string | string[]; filter?: string }>;
}) {
  const [params, client] = await Promise.all([searchParams, ticketClient()]);
  const filter = parseTicketListFilter(params.filter);
  const { data: gigs } = await client.from("gigs").select("id, title, perform_date")
    .order("perform_date", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  return (
    <div className="w-full max-w-4xl space-y-6">
      <AdminPageHeading
        title="예매 관리"
        description="입금 확인, 취소·환불, 현장 입장을 관리합니다."
        aside={gigs?.length ? (
          <form action="/admin/reservations/export" method="get" className="flex flex-wrap items-center gap-2">
            <select
              name="gigId"
              aria-label="다운로드할 공연"
              defaultValue=""
              required
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm sm:w-52"
            >
              <option value="" disabled>공연 선택</option>
              {gigs.map((gig) => (
                <option key={gig.id} value={gig.id}>
                  {gig.title || "제목 없는 공연"}{gig.perform_date ? ` · ${gig.perform_date}` : ""}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              <Download aria-hidden="true" />
              예매자 엑셀 다운로드
            </Button>
          </form>
        ) : undefined}
      />
      <ReservationList
        admin
        page={Number(params.page ?? 1)}
        query={typeof params.q === "string" ? params.q : undefined}
        filter={filter}
        basePath="/admin/reservations"
      />
    </div>
  );
}
