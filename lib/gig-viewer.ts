import "server-only";

import { cache } from "react";
import { getIsAdmin } from "@/lib/auth-admin";
import { createClient } from "@/lib/supabase/server";

/** Authentication alone does not grant membership. Share the verified viewer within this request. */
export const getGigViewer = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { user: null, isLoggedIn: false, isAdmin: false, isApprovedMember: false };
  }

  const [{ data: profile, error: profileError }, isAdmin] = await Promise.all([
    supabase.from("users").select("status").eq("id", user.id).maybeSingle(),
    getIsAdmin(),
  ]);
  return {
    user,
    isLoggedIn: true,
    isAdmin,
    isApprovedMember: !profileError && profile?.status === "approved",
  };
});
