import { Calendar, MapPin } from "lucide-react";
import { TicketCardLink } from "@/components/tickets/ticket-card-link";
import type { TicketReservation } from "@/lib/ticket-reservations";
import { formatKoreanDateTime } from "@/lib/utils";

export function GigTicketLink({
  gigId,
  gig,
}: {
  gigId: number;
  gig: TicketReservation["gig_snapshot"] | null;
}) {
  return (
    <TicketCardLink
      href={`/gigs/${gigId}`}
      stub={<span className="underline-offset-4 group-hover:underline group-focus-visible:underline">공연 상세</span>}
    >
      <h2 className="break-words break-keep text-lg font-bold leading-snug tracking-tight sm:text-xl">
        {gig?.title ?? "공연 정보"}
      </h2>
      {gig && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <p className="flex min-w-0 items-start gap-1.5">
            <Calendar className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {formatKoreanDateTime(gig.date, gig.time?.slice(0, 5))}
          </p>
          <p className="flex min-w-0 items-start gap-1.5">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{gig.location || "장소 추후 안내"}</span>
          </p>
        </div>
      )}
    </TicketCardLink>
  );
}
