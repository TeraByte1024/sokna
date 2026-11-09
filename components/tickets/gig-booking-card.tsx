import Link from "next/link";
import { Calendar, ChevronRight, MapPin } from "lucide-react";
import type { TicketReservation } from "@/lib/ticket-reservations";
import { formatKoreanDateTime } from "@/lib/utils";

export function GigBookingCard({
  gigId,
  gig,
}: {
  gigId: number;
  gig: TicketReservation["gig_snapshot"] | null;
}) {
  return (
    <Link
      href={`/gigs/${gigId}`}
      className="group block space-y-2 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 break-words break-keep text-lg font-bold leading-snug tracking-tight underline-offset-4 group-hover:underline group-focus-visible:underline sm:text-xl">
          {gig?.title ?? "공연 정보"}
        </h2>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
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
    </Link>
  );
}
