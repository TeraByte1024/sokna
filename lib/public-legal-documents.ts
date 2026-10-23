import { LEGAL_DOCUMENT_HISTORY } from "@/lib/legal-documents";
import { PRIVACY_POLICY_HISTORY } from "@/lib/privacy-policy";

export type PublicLegalKind = "terms" | "privacy";
export type PublicLegalDocument = { postedOn: string; title: string; content: string };

export function publicLegalDocuments(kind: PublicLegalKind): PublicLegalDocument[] {
  const source: readonly PublicLegalDocument[] = kind === "privacy" ? PRIVACY_POLICY_HISTORY : LEGAL_DOCUMENT_HISTORY
    .filter((entry) => entry.publiclyListed === true)
    .flatMap((entry) => entry.documents.filter((document) => document.kind === "terms")
      .map((document) => ({ postedOn: document.postedOn, title: "이용약관", content: document.content })));
  const byDate = new Map<string, PublicLegalDocument>();
  for (const document of source) {
    const previous = byDate.get(document.postedOn);
    if (previous && (previous.title !== document.title || previous.content !== document.content)) {
      throw new Error(`Conflicting public legal documents for ${kind} on ${document.postedOn}`);
    }
    byDate.set(document.postedOn, document);
  }
  return Array.from(byDate.values())
    .sort((a, b) => b.postedOn.localeCompare(a.postedOn));
}

export function publicLegalDocument(kind: PublicLegalKind, postedOn?: string) {
  const documents = publicLegalDocuments(kind);
  return postedOn === undefined ? documents[0] : documents.find((document) => document.postedOn === postedOn);
}
