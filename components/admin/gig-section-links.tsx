"use client";

import { Button } from "@/components/ui/button";
import { ADMIN_GIG_SECTIONS } from "@/lib/admin-gig-sections";

export function GigSectionLinks() {
  return <div className="hidden flex-wrap gap-2 sm:flex">{ADMIN_GIG_SECTIONS.map(([id, label]) => <Button key={id} asChild variant="outline">
    <a href={`#${id}`} onClick={(event) => {
      // Scroll within the form without a history navigation that could trigger its leave warning.
      event.preventDefault();
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }}>{label}</a>
  </Button>)}</div>;
}
