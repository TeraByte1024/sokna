import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function TicketNotice({
  title,
  body,
  actions,
}: {
  title: string;
  body?: string;
  actions?: ReactNode;
}) {
  if (!body && !actions) return null;

  return (
    <Card className="space-y-1.5 p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {body && (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {actions && <div className="pt-2">{actions}</div>}
    </Card>
  );
}
