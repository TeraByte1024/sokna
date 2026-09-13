"use client";

import React from "react";
import { GigForm, type SetlistItem } from "@/components/gigs/gig-form";
import type { Performer } from "@/components/performer-selector";

export type { SetlistItem };

interface GigEditFormProps {
  gig: {
    id: number;
    title: string | null;
    subtitle?: string | null;
    perform_date: string | null;
    meeting_date: string | null;
    location: string | null;
    poster_url: string | null;
    is_public: boolean;
  };
  initialPerformers: Performer[];
  initialSetlists: SetlistItem[];
}

export function GigEditForm({
  gig,
  initialPerformers,
  initialSetlists,
}: GigEditFormProps) {
  return (
    <GigForm
      mode="edit"
      gig={{
        id: gig.id,
        title: gig.title,
        subtitle: gig.subtitle,
        perform_date: gig.perform_date || "",
        meeting_date: gig.meeting_date,
        location: gig.location,
        poster_url: gig.poster_url,
        is_public: gig.is_public,
      }}
      initialPerformers={initialPerformers}
      initialSetlists={initialSetlists}
    />
  );
}
