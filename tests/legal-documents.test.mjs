import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";

const documents = () => [
  { kind: "terms", postedOn: "2026-10-23", title: "Terms", content: "Test document A", published: true },
  { kind: "privacy", postedOn: "2026-10-23", title: "Privacy", content: "Test document B", published: true },
];
function fixture(environment, registered) {
  return loadTs("lib/legal-consent.ts", {
    "server-only": {}, "@/lib/legal-documents": { LEGAL_DOCUMENTS: registered, LEGAL_DOCUMENT_HISTORY: [] },
  }, { process: { env: { NODE_ENV: environment } } });
}

test("service documents and revisions are available from source without a local file", () => {
  const { LEGAL_DOCUMENT_HISTORY, LEGAL_DOCUMENTS } = loadTs("lib/legal-documents.ts");
  assert.ok(LEGAL_DOCUMENT_HISTORY.length);
  assert.deepEqual(LEGAL_DOCUMENTS.map((item) => item.kind).sort(), ["privacy", "terms"]);
  for (const entry of LEGAL_DOCUMENT_HISTORY) {
    assert.match(entry.postedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal("revision" in entry || "recordedOn" in entry, false);
    assert.deepEqual(entry.documents.map((item) => item.kind).sort(), ["privacy", "terms"]);
    for (const item of entry.documents) {
      assert.ok(item.title && item.content);
      assert.equal("version" in item, false);
      assert.match(item.postedOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.doesNotMatch(item.postedOn + item.content, /draft|검토용 초안|\[확인 후 확정\]/);
    }
  }
  const current = fixture("development", LEGAL_DOCUMENTS).currentLegalDocuments();
  assert.equal(current.documents.length, 2);
  assert.equal(current.published, true);
  assert.ok(LEGAL_DOCUMENTS.every((item) => !("published" in item)), "Source documents have no manual publication switch");
});

test("production signup documents are available without a publication toggle", () => {
  const { LEGAL_DOCUMENTS } = loadTs("lib/legal-documents.ts");
  const production = fixture("production", LEGAL_DOCUMENTS).currentLegalDocuments();
  assert.equal(production.documents.length, 2);
  assert.equal(production.published, true);
  assert.equal(fixture("production", [documents()[0]]).currentLegalDocuments().published, false);
});

test("published source documents load in every environment and content edits change the revision", () => {
  for (const environment of ["development", "production", "test"]) {
    const registered = documents(), core = fixture(environment, registered);
    const current = core.currentLegalDocuments();
    assert.equal(current.published, true);
    assert.equal(current.documents.length, 2);
    registered[0].content += " changed";
    assert.notEqual(core.currentLegalDocuments().revision, current.revision);
  }
  assert.deepEqual(fixture("production", []).currentLegalDocuments().documents, []);
});

test("previous source revisions remain available for signup consent restoration", () => {
  const original = documents(), before = fixture("production", original).currentLegalDocuments();
  const updated = documents().map((item) => ({ ...item, postedOn: "2026-10-24", content: `${item.content} changed` }));
  const core = loadTs("lib/legal-consent.ts", {
    "server-only": {}, "@/lib/legal-documents": { LEGAL_DOCUMENTS: updated, LEGAL_DOCUMENT_HISTORY: [{ documents: original }, { documents: updated }] },
  }, { process: { env: { NODE_ENV: "production" } } });
  assert.deepEqual(core.legalDocumentsAtRevision(before.revision).documents, before.documents);
  assert.notEqual(core.currentLegalDocuments().revision, before.revision);
  assert.equal(core.legalDocumentsAtRevision("unknown"), null);
});
