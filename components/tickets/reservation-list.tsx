import Link from "next/link";
import { readTicketReservationPage } from "@/lib/ticket-server";
import { AdminReservationList } from "@/components/tickets/admin-reservation-list";
import { AdminReservationSearch } from "@/components/tickets/admin-reservation-search";
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge";
import { TicketCardLink } from "@/components/tickets/ticket-card-link";
import { Button } from "@/components/ui/button";
import { formatKoreanDateTime } from "@/lib/utils";
import {
  isRefundRequestItem,
  matchesTicketFilter,
  won,
  type TicketListFilter,
  type TicketReservation,
} from "@/lib/ticket-reservations";

function UserReservationRow({ reservation: r }: { reservation: TicketReservation }) {
  const gig = r.gig_snapshot;
  return (
    <li>
      <TicketCardLink
        href={`/reservations/${r.id}`}
        stub={
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-start">
            <TicketStatusBadge reservation={r} includeAdmission />
            <span className="text-sm tabular-nums">{r.quantity}매 · {won(r.total_amount)}</span>
          </div>
        }
      >
        <h2 className="break-words break-keep font-semibold leading-snug underline-offset-4 group-hover:underline group-focus-visible:underline sm:text-lg">
          {gig.title}
        </h2>
        <p className="break-words text-sm text-muted-foreground">
          {formatKoreanDateTime(gig.date, gig.time?.slice(0, 5))}
          {gig.location && ` · ${gig.location}`}
        </p>
        <p className="break-words text-xs text-muted-foreground">예매번호 {r.code}</p>
      </TicketCardLink>
    </li>
  );
}

export async function ReservationList({
  admin = false,
  gigId,
  query = "",
  page = 1,
  filter = "all",
  basePath,
}: {
  admin?: boolean;
  gigId?: number;
  query?: string;
  page?: number;
  filter?: TicketListFilter;
  basePath: string;
}) {
  const pageNumber = Number.isSafeInteger(page) && page > 0 && page < 100000 ? page : 1;
  const q = query.slice(0, 120);
  const activeTabFilter: TicketListFilter =
    filter === "awaiting_payment" || filter === "approved" ? filter : "all";

  const result = await readTicketReservationPage({ admin, gigId, query: q, page: pageNumber });
  const errorMessage = !result.ok && (
    <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      {result.error}
    </p>
  );

  if (admin) {
    return (
      <div className="space-y-6">
        <AdminReservationSearch key={basePath} basePath={basePath} defaultQuery={q} />
        {result.ok ? (
          <AdminReservationList
            key={JSON.stringify([basePath, q, pageNumber, activeTabFilter])}
            initial={result}
            initialPage={pageNumber}
            query={q}
            gigId={gigId}
            filter={activeTabFilter}
          />
        ) : errorMessage}
      </div>
    );
  }

  const allRows = result.ok ? result.rows : [];
  const hasMore = result.ok && result.hasMore;
  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set("page", String(nextPage));
    if (q) params.set("q", q);
    if (activeTabFilter !== "all") params.set("filter", activeTabFilter);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const pagination = (pageNumber > 1 || hasMore) && (
    <nav aria-label="예매 목록 페이지" className="flex items-center justify-between pt-2 text-sm">
      {pageNumber > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={buildHref(pageNumber - 1)}>이전 페이지</Link>
        </Button>
      ) : (
        <span />
      )}
      {hasMore && (
        <Button asChild variant="outline" size="sm">
          <Link href={buildHref(pageNumber + 1)}>다음 페이지</Link>
        </Button>
      )}
    </nav>
  );

  const visibleRows = allRows.filter(
    (r) => matchesTicketFilter(r, activeTabFilter) || isRefundRequestItem(r) || r.status === "cancelled",
  );

  return (
    <div className="space-y-4">
      {errorMessage ? errorMessage : visibleRows.length ? (
        <ul className="space-y-3">
          {visibleRows.map((r) => <UserReservationRow key={r.id} reservation={r} />)}
        </ul>
      ) : (
        <div className="space-y-3 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {q || activeTabFilter !== "all" || pageNumber > 1
              ? "표시할 예매 내역이 없습니다."
              : "아직 예매 내역이 없습니다."}
          </p>
          {!q && activeTabFilter === "all" && pageNumber === 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href="/gigs">공연 보러 가기</Link>
            </Button>
          )}
        </div>
      )}
      {pagination}
    </div>
  );
}
