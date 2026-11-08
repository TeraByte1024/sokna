import { ReservationList } from "@/components/tickets/reservation-list";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { parseTicketListFilter } from "@/lib/ticket-reservations";

export const metadata = { title: "예매 관리", robots: { index: false, follow: false } };

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string | string[]; filter?: string }>;
}) {
  const params = await searchParams;
  const filter = parseTicketListFilter(params.filter);

  return (
    <div className="w-full max-w-4xl space-y-6">
      <AdminPageHeading
        title="예매 관리"
        description="입금 확인, 취소·환불, 현장 입장을 관리합니다."
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
