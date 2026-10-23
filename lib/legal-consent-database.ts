import type { Database } from "@/lib/supabase/database.types";

// Pending migration overlay. The linked generated types stay authoritative for
// deployed tables; merge this table into them after migration + npm run types.
export type LegalConsentRow = {
  user_id: string;
  document_kind: string;
  document_version: string;
  document_hash: string;
  document_title: string;
  document_content: string;
  accepted_at: string;
};
export type LegalConsentDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      user_legal_consents: {
        Row: LegalConsentRow;
        Insert: Omit<LegalConsentRow, "accepted_at"> & { accepted_at?: string };
        Update: never;
        Relationships: [];
      };
    };
  };
};
