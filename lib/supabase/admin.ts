import { createClient } from "@supabase/supabase-js";

export const SUPABASE_ADMINS_TABLE =
  process.env.NEXT_PUBLIC_SUPABASE_ADMINS_TABLE ?? "admins";


export function createAdminClient() {
  // 반드시 서버 환경(Node.js)에서만 실행되어야 합니다.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
  );
}