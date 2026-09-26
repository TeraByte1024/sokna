import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type MemberProfile = {
  generation: number | null;
  part: string | null;
};

// OAuth creates a pending users row before the membership form is submitted.
export function hasCompletedMemberProfile(profile: MemberProfile | null | undefined): boolean {
  return Boolean(
    profile &&
      Number.isInteger(profile.generation) &&
      (profile.generation ?? 0) > 0 &&
      profile.part?.trim(),
  );
}

// Keep the initial admin list, refreshed list, and header count in sync.
export async function getPendingMemberApplications(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, generation, part, email, status, applied_at, approved_at, marketing_opt_in")
    .eq("status", "pending")
    .gte("generation", 1)
    .not("part", "is", null)
    .neq("part", "")
    .order("applied_at", { ascending: false });

  return { data: data?.filter(hasCompletedMemberProfile) ?? null, error };
}
