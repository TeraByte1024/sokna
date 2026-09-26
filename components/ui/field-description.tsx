import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-[11px] leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}
