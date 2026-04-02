"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PartConfigs, SetlistLink } from "@/lib/setlist";

export async function addSetlist(
  gigId: string,
  payload: {
    title: string;
    artist: string;
    description: string;
    part_config: PartConfigs;
    references: SetlistLink[];
  }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("setlists").insert({
    gig_id: gigId,
    title: payload.title,
    artist: payload.artist,
    description: payload.description,
    part_config: payload.part_config,
    references: payload.references,
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
