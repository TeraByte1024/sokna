import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DisclosureSummary({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <summary className={cn("flex list-none cursor-pointer items-center gap-2 [&::-webkit-details-marker]:hidden", className)}>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground group-open/disclosure:rotate-90 motion-safe:transition-transform"
      />
      <span>{children}</span>
    </summary>
  );
}
