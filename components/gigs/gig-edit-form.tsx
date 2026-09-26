"use client";

import React from "react";
import { GigForm, type SetlistItem } from "@/components/gigs/gig-form";
import type { Performer } from "@/components/performer-selector";
import { getGigVisibility, type GigVisibility } from "@/lib/gig-visibility";

export type { SetlistItem };

interface GigEditFormProps {
  gig: {
    id: number;
    title: string | null;
    subtitle?: string | null;
    advance_ticket_price?: number | null;
    door_ticket_price?: number | null;
    perform_date: string | null;
    perform_time?: string | null;
    meeting_date: string | null;
    meeting_time?: string | null;
    location: string | null;
    meeting_location?: string | null;
    poster_url: string | null;
    visibility?: GigVisibility | null;
    is_public?: boolean | null;
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
        advance_ticket_price: gig.advance_ticket_price,
        door_ticket_price: gig.door_ticket_price,
        perform_date: gig.perform_date || "",
        perform_time: gig.perform_time,
        meeting_date: gig.meeting_date,
        meeting_time: gig.meeting_time,
        location: gig.location,
        meeting_location: gig.meeting_location,
        poster_url: gig.poster_url,
        visibility: getGigVisibility(gig),
      }}
      initialPerformers={initialPerformers}
      initialSetlists={initialSetlists}
    />
  );
}
