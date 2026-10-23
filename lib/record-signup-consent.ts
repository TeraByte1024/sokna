import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { legalDocumentsAtRevision } from "@/lib/legal-consent";
import { missingLegalConsents } from "@/lib/legal-consent-model";
import type { LegalConsentDatabase } from "@/lib/legal-consent-database";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { savePushConsent } from "@/lib/push-consent";
import { readSignupConsent, signupConsentMatchesUser } from "@/lib/signup-consent";

/** A signed pre-auth choice is evidence only after a server-verified identity. */
export async function recordSignupConsent(user: User, rawTicket: unknown) {
  const ticket = readSignupConsent(rawTicket);
  if (!ticket || !signupConsentMatchesUser(ticket, user)) return null;
  const accepted = legalDocumentsAtRevision(ticket.revision);
  if (!accepted || ticket.preview !== !accepted.published) return null;
  if (!accepted.published) return { ticket, preview: true };
  const client = await createClient() as unknown as SupabaseClient<LegalConsentDatabase>;
  const { data, error } = await client.from("user_legal_consents")
    .select("document_kind, document_version, document_hash").eq("user_id", user.id);
  if (error) throw error;
  const missing = missingLegalConsents(accepted.documents, data ?? []);
  if (missing.length) {
    // An existing social account's unchecked default cannot withdraw its earlier opt-in.
    const createdAt = Date.parse(user.created_at);
    const isNew = createdAt >= ticket.acceptedAt - 60_000 && createdAt <= ticket.acceptedAt + 3600_000;
    if (isNew || ticket.marketingAgreed) {
      const { error: preferenceError } = await savePushConsent(await createClient(), user.id, ticket.marketingAgreed);
      if (preferenceError) throw preferenceError;
    }
    const service = createServiceClient() as unknown as SupabaseClient<LegalConsentDatabase>;
    const { error: writeError } = await service.from("user_legal_consents").upsert(
      accepted.documents.filter((document) => missing.includes(document.kind)).map((document) => ({
        user_id: user.id, document_kind: document.kind, document_version: document.postedOn,
        document_hash: document.hash, document_title: document.title, document_content: document.content,
        accepted_at: new Date(ticket.acceptedAt).toISOString(),
      })), { onConflict: "user_id,document_kind,document_version,document_hash", ignoreDuplicates: true });
    if (writeError) throw writeError;
  }
  return { ticket, preview: false };
}
