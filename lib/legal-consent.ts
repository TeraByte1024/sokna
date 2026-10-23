import "server-only";
import { createHash } from "node:crypto";
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_HISTORY, type LegalDocument } from "@/lib/legal-documents";

function snapshot(documentsInput: readonly LegalDocument[]) {
  const documents = documentsInput.map((document) => ({
    ...document,
    hash: createHash("sha256").update(JSON.stringify([document.title, document.content, document.postedOn])).digest("hex"),
  }));
  const revision = createHash("sha256").update(JSON.stringify(documents.map(({ kind, postedOn, hash }) => [kind, postedOn, hash]))).digest("hex");
  return { documents, revision, published: documents.length === 2 };
}

export function currentLegalDocuments() { return snapshot(LEGAL_DOCUMENTS); }

export function legalDocumentsAtRevision(revision: string) {
  const current = currentLegalDocuments();
  if (current.revision === revision) return current;
  return (LEGAL_DOCUMENT_HISTORY ?? []).map((entry) => snapshot(entry.documents)).find((entry) => entry.revision === revision) ?? null;
}
