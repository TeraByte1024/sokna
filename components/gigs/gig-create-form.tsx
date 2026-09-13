"use client";

import React from "react";
import { GigForm } from "@/components/gigs/gig-form";
import type { Performer } from "@/components/performer-selector";

export type { Performer };

export function GigCreateForm() {
  return <GigForm mode="create" />;
}