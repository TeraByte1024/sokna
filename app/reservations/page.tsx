import { redirect } from "next/navigation";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { ReservationList } from "@/components/tickets/reservation-list";
import { ticketClient } from "@/lib/ticket-server";
import { parseTicketListFilter } from "@/lib/ticket-reservations";

export const metadata = { title: "내 예매", robots: { index: false, follow: false } };

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string | string[]; filter?: string }>;
}) {
  const { data: { user } } = await (await ticketClient()).auth.getUser();
  if (!user) redirect("/auth/login?redirect=%2Freservations");
  const params = await searchParams;

  return (
    <SiteLayout>
      <PageContainer>
        <div className="w-full space-y-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">내 예매</h1>
          <ReservationList
            page={Number(params.page ?? 1)}
            query={typeof params.q === "string" ? params.q : undefined}
            filter={parseTicketListFilter(params.filter)}
            basePath="/reservations"
          />
        </div>
      </PageContainer>
    </SiteLayout>
  );
}
