import type { Database } from "@/lib/supabase/database.types";

export type LegalConsentRow = Database["public"]["Tables"]["user_legal_consents"]["Row"];
export type LegalConsentDatabase = Database;
