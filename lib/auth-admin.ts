import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_ADMINS_TABLE } from "@/lib/supabase/admin";

async function getIsAdminUncached(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return false;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return false;

  const { data, error } = await supabase
    .from(SUPABASE_ADMINS_TABLE)
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

/** 동일 요청에서 헤더·페이지 등 중복 조회 방지 */
export const getIsAdmin = cache(getIsAdminUncached);
