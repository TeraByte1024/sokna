"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SetlistFormValues } from "@/lib/setlist";

export async function addSetlist(
  gigId: string,
  payload: SetlistFormValues,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("setlists").insert({
    gig_id: Number(gigId),
    title: payload.title,
    artist: payload.artist,
    required_parts: payload.requiredParts,
    sheet_exists: payload.sheetExists,
    description: payload.description,
    links: payload.links,
  });

  if (error) throw error;
  revalidatePath(`/gigs/${gigId}/setlists`);
}

export async function deleteSetlist(gigId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("setlists").delete().eq("id", id);
  
  if (error) throw error;
  revalidatePath(`/gigs/${gigId}/setlists`);
}
