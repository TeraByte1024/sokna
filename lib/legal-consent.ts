import "server-only";
import { createHash } from "node:crypto";
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_HISTORY, type LegalDocument } from "@/lib/legal-documents";

function configuredDocuments(): readonly LegalDocument[] {
  if (LEGAL_DOCUMENTS.every((document) => document.published) || process.env.NODE_ENV === "development") return LEGAL_DOCUMENTS;
  // Keep pending documents visible locally without enabling production consent writes.
  return [];
}

function snapshot(documentsInput: readonly LegalDocument[]) {
  const documents = documentsInput.map((document) => ({
    ...document,
    hash: createHash("sha256").update(JSON.stringify([document.title, document.content, document.postedOn])).digest("hex"),
  }));
  const revision = createHash("sha256").update(JSON.stringify(documents.map(({ kind, postedOn, hash, published }) => [kind, postedOn, hash, published]))).digest("hex");
  return { documents, revision, published: documents.length === 2 && documents.every((document) => document.published) };
}

export function currentLegalDocuments() { return snapshot(configuredDocuments()); }

export function legalDocumentsAtRevision(revision: string) {
  const current = currentLegalDocuments();
  if (current.revision === revision) return current;
  return (LEGAL_DOCUMENT_HISTORY ?? []).map((entry) => snapshot(entry.documents)).find((entry) => entry.revision === revision) ?? null;
}
