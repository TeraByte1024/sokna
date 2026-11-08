import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReservationList } from "@/components/tickets/reservation-list";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { parseTicketListFilter } from "@/lib/ticket-reservations";

export const metadata = { title: "공연 예매 관리", robots: { index: false, follow: false } };

export default async function GigReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string | string[]; filter?: string }>;
}) {
  const { id } = await params;
  const gigId = Number(id);
  if (!Number.isSafeInteger(gigId) || gigId < 1) notFound();
  const search = await searchParams;
  const filter = parseTicketListFilter(search.filter);

  return (
    <div className="w-full max-w-4xl space-y-6">
      <Link
        href={`/admin/gigs/${gigId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        공연 관리로 돌아가기
      </Link>
      <AdminPageHeading
        title="공연 예매 관리"
        description="예매번호·예매자·입금자명·연락처로 명단을 검색해 입금 확인, 환불 처리, 현장 입장을 관리합니다."
      />
      <ReservationList
        admin
        gigId={gigId}
        page={Number(search.page ?? 1)}
        query={typeof search.q === "string" ? search.q : undefined}
        filter={filter}
        basePath={`/admin/gigs/${gigId}/reservations`}
      />
    </div>
  );
}
