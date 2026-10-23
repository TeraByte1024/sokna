import type { LegalDocument, LegalDocumentKind } from "@/lib/legal-documents";

export type LegalConsentRecord = {
  document_kind: string;
  document_version: string;
  document_hash: string;
};
export type LegalDocumentSnapshot = LegalDocument & { hash: string };
export type LegalConsentState =
  | { status: "signed_out" }
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "current" | "required" | "draft"; userId: string; revision: string; documents: LegalDocumentSnapshot[]; missing: LegalDocumentKind[]; marketingOptIn?: boolean };

export function missingLegalConsents(documents: LegalDocumentSnapshot[], records: LegalConsentRecord[]) {
  return documents.filter((document) => !records.some((record) =>
    record.document_kind === document.kind && record.document_version === document.postedOn && record.document_hash === document.hash,
  )).map((document) => document.kind);
}
