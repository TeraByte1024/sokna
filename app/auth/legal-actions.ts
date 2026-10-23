"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth-server-data";
import { currentLegalDocuments } from "@/lib/legal-consent";
import { missingLegalConsents, type LegalConsentState } from "@/lib/legal-consent-model";
import type { LegalConsentDatabase } from "@/lib/legal-consent-database";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { savePushConsent } from "@/lib/push-consent";
import { restoreSignupConsent } from "@/lib/restore-signup-consent";

export async function getLegalConsentStateAction(): Promise<LegalConsentState> {
  try {
    const { data: { user }, error: authError } = await getAuthUser();
    if (authError) throw authError;
    if (!user) return { status: "signed_out" };
    const { documents, revision, published } = currentLegalDocuments();
    if (!documents.length) return { status: "not_configured" };
    const signupConsent = await restoreSignupConsent(user);
    if (signupConsent?.preview && signupConsent.ticket.revision === revision) {
      return { status: "current", userId: user.id, documents, revision, missing: [] };
    }
    if (!published) return { status: "draft", userId: user.id, documents, revision, missing: documents.map((document) => document.kind) };
    const client = await createClient() as unknown as SupabaseClient<LegalConsentDatabase>;
    const { data, error } = await client.from("user_legal_consents")
      .select("document_kind, document_version, document_hash").eq("user_id", user.id);
    if (error) throw error;
    const missing = missingLegalConsents(documents, data ?? []);
    let marketingOptIn = false;
    if (missing.length) {
      const { data: profile, error: profileError } = await client.from("users")
        .select("marketing_opt_in").eq("id", user.id).maybeSingle();
      if (profileError || !profile) throw profileError ?? new Error("Missing account preferences");
      marketingOptIn = profile.marketing_opt_in === true;
    }
    return { status: missing.length ? "required" : "current", userId: user.id, documents, revision, missing, marketingOptIn };
  } catch {
    return { status: "error", message: "약관 동의 내역을 확인하지 못했습니다. 다시 시도해 주세요." };
  }
}

export async function acceptLegalDocumentsAction(input: {
  expectedUserId: string; revision: string; termsAgreed: boolean; privacyAgreed: boolean; marketingAgreed?: boolean;
}) {
  try {
    const { data: { user }, error: authError } = await getAuthUser();
    if (authError || !user || user.id !== input?.expectedUserId) {
      return { ok: false as const, refresh: true, error: "로그인 계정이 변경되었습니다. 다시 확인해 주세요." };
    }
    const { documents, revision, published } = currentLegalDocuments();
    if (!published) return { ok: false as const, error: "정식 게시된 약관만 동의 내역을 저장할 수 있습니다." };
    if (input.revision !== revision) return { ok: false as const, refresh: true, error: "약관이 변경되었습니다. 최신 내용을 다시 확인해 주세요." };
    if (input.termsAgreed !== true || input.privacyAgreed !== true) {
      return { ok: false as const, error: "이용약관과 개인정보 수집·이용에 모두 동의해 주세요." };
    }
    if (input.marketingAgreed !== undefined) {
      if (typeof input.marketingAgreed !== "boolean") return { ok: false as const, error: "마케팅 정보 수신 동의 여부를 확인해 주세요." };
      // Reuse the authenticated account preference path and database-owned
      // timestamps/device revocation. This does not register a push device.
      const { error: preferenceError } = await savePushConsent(await createClient(), user.id, input.marketingAgreed);
      if (preferenceError) return { ok: false as const, error: "마케팅 정보 수신 동의를 저장하지 못했습니다. 다시 시도해 주세요." };
    }
    const client = createServiceClient() as unknown as SupabaseClient<LegalConsentDatabase>;
    const { error } = await client.from("user_legal_consents").upsert(documents.map((document) => ({
      user_id: user.id, document_kind: document.kind, document_version: document.postedOn,
      document_hash: document.hash, document_title: document.title, document_content: document.content,
    })), { onConflict: "user_id,document_kind,document_version,document_hash", ignoreDuplicates: true });
    if (error) throw error;
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "동의 내역을 저장하지 못했습니다. 다시 시도해 주세요." };
  }
}
