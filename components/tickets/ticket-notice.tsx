import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function TicketNotice({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  if (!body && !children) return null;

  return (
    <Card className="space-y-1.5 p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {body && (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {children && <div className="space-y-3 pt-2">{children}</div>}
    </Card>
  );
}
