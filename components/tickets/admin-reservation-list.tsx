"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Ticket } from "lucide-react";
import { loadAdminReservationPage } from "@/app/reservations/actions";
import { AdminReservationItem } from "@/components/tickets/admin-reservation-quick-actions";
import { Button } from "@/components/ui/button";
import {
  isRefundRequestItem,
  matchesTicketFilter,
  type TicketListFilter,
  type TicketReservation,
} from "@/lib/ticket-reservations";

type LoadedPage = { rows: TicketReservation[]; hasMore: boolean };

export function AdminReservationList({
  initial,
  initialPage,
  query,
  gigId,
  filter,
}: {
  initial: LoadedPage;
  initialPage: number;
  query: string;
  gigId?: number;
  filter: TicketListFilter;
}) {
  const [pages, setPages] = useState<LoadedPage[]>([]);
  const [updatedRows, setUpdatedRows] = useState<Record<string, TicketReservation>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = (pages.at(-1) ?? initial).hasMore;

  const loadNext = useCallback(async () => {
    if (!hasMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const page = await loadAdminReservationPage(initialPage + pages.length + 1, query, gigId);
      if (!page.ok) {
        setError(page.error);
        return;
      }
      setPages((current) => current.length === pages.length ? [...current, page] : current);
    } catch {
      setError("예매 목록을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [gigId, hasMore, initialPage, pages.length, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading || error || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadNext();
    }, { rootMargin: "0px 0px 200px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, hasMore, loadNext, loading]);

  const rowsById = new Map<string, TicketReservation>();
  for (const row of [...initial.rows, ...pages.flatMap((page) => page.rows)]) {
    const previous = rowsById.get(row.id);
    if (previous && previous.version >= row.version) continue;
    const updated = updatedRows[row.id];
    rowsById.set(row.id, updated && updated.version > row.version ? updated : row);
  }
  const rows = Array.from(rowsById.values()).filter(
    (r) => isRefundRequestItem(r) || r.status === "cancelled" || matchesTicketFilter(r, filter),
  );

  const onUpdated = (reservation: TicketReservation | null) => {
    if (!reservation) {
      setPages([]);
      setError("");
      return;
    }
    setUpdatedRows((current) => {
      const previous = current[reservation.id];
      if (previous && previous.version >= reservation.version) return current;
      return { ...current, [reservation.id]: reservation };
    });
  };

  return (
    <section aria-labelledby="admin-reservations-heading" className="space-y-3">
      <h2 id="admin-reservations-heading" className="text-base font-bold tracking-tight sm:text-lg">
        예매 목록 <span className="ml-1 text-sm font-normal text-muted-foreground">{rows.length}건</span>
      </h2>
      {rows.length > 0 && (
        <ul className="space-y-2.5">
          {rows.map((reservation) => (
            <li key={reservation.id}>
              <AdminReservationItem reservation={reservation} onUpdated={onUpdated} />
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && !hasMore && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/50 px-5 py-8 text-center">
          <Ticket className="mb-2.5 size-7 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">
            {query ? "검색 결과가 없습니다." : "표시할 예매 내역이 없습니다."}
          </p>
        </div>
      )}
      {hasMore && (
        <div ref={sentinelRef} className="space-y-2 pt-1 text-center">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadNext()}>
            {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {loading ? "불러오는 중…" : error ? "다시 시도" : "더 보기"}
          </Button>
        </div>
      )}
    </section>
  );
}
