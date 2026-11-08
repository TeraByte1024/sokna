import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function TicketCardLink({
  href,
  children,
  stub,
}: {
  href: string;
  children: ReactNode;
  stub: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-row"
    >
      <div className="min-w-0 flex-1 space-y-2 p-4 sm:p-5">{children}</div>
      <div className="relative flex shrink-0 items-center justify-between gap-2 border-t border-dashed bg-muted/30 px-4 py-3 text-sm font-medium sm:border-l sm:border-t-0 sm:px-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-2 -top-2 size-4 rounded-full border bg-background sm:left-0 sm:-translate-x-1/2"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 -top-2 size-4 rounded-full border bg-background sm:-bottom-2 sm:left-0 sm:right-auto sm:top-auto sm:-translate-x-1/2"
        />
        {stub}
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </div>
    </Link>
  );
}
