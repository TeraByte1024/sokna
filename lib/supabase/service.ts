import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createServiceClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceRoleKey =
		process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!url || !serviceRoleKey) {
		throw new Error(
			"NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY가 설정되지 않았습니다.",
		);
	}

	return createClient<Database>(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
