import { redirect, notFound } from "next/navigation";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { Card } from "@/components/ui/card";
import { BookingForm } from "@/components/tickets/booking-form";
import { GigBookingCard } from "@/components/tickets/gig-booking-card";
import { ticketClient, ticketDatabaseError } from "@/lib/ticket-server";
import { ticketDateTime, type TicketOffer } from "@/lib/ticket-reservations";

export const metadata = {
  title: "공연 예매",
  robots: { index: false, follow: false },
};

function bookingUnavailableMessage(offer: TicketOffer) {
  if (!offer.enabled) return "이 공연은 온라인 사전예매를 받지 않습니다.";
  if (offer.starts_at && new Date(offer.server_time) < new Date(offer.starts_at)) {
    return "사전예매 시작 전입니다.";
  }
  if ((offer.unit_price ?? 0) > 0 && !offer.account) {
    return "입금 계좌를 준비 중입니다.";
  }
  if (offer.remaining <= 0) return "준비된 사전예매 수량이 모두 소진되었습니다.";
  return "사전예매 기간이 종료되었습니다.";
}

export default async function ReservePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gigId = Number(id);
  if (!Number.isSafeInteger(gigId) || gigId < 1) notFound();

  const client = await ticketClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/gigs/${gigId}/reserve`)}`);
  }

  const { data, error } = await client.rpc("get_ticket_booking_offer", {
    p_gig_id: gigId,
  });
  const offer = data as unknown as TicketOffer | null;

  return (
    <SiteLayout>
      <PageContainer>
        <div className="w-full space-y-5">
          <header className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">공연 예매</h1>
            <GigBookingCard gigId={gigId} gig={offer} />
          </header>

          {error || !offer ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {ticketDatabaseError(error)}
            </p>
          ) : offer.open ? (
            <BookingForm key={offer.offer_hash} offer={offer} />
          ) : (
            <Card className="space-y-2 p-4 shadow-sm sm:p-5">
              <h2 className="font-semibold">{bookingUnavailableMessage(offer)}</h2>
              {offer.starts_at && offer.deadline ? (
                <p className="text-sm text-muted-foreground">
                  사전예매 기간 {ticketDateTime(offer.starts_at)} ~ {ticketDateTime(offer.deadline)}
                </p>
              ) : offer.deadline && (
                <p className="text-sm text-muted-foreground">
                  사전예매 마감 {ticketDateTime(offer.deadline)}
                </p>
              )}
            </Card>
          )}
        </div>
      </PageContainer>
    </SiteLayout>
  );
}
