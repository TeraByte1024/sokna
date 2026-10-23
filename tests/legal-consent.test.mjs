import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";

const user = { id: "11111111-2222-4333-8444-555555555555" };
const definitions = () => [
  { kind: "terms", postedOn: "2026-10-23", title: "이용약관", content: "Isolated test terms.", published: true },
  { kind: "privacy", postedOn: "2026-10-23", title: "개인정보 수집·이용", content: "Isolated test privacy notice.", published: true },
];

function fixture({ documents = definitions(), currentUser = user, authError = null, readError = null, writeError = null, initialMarketingOptIn = false, preferenceError = null } = {}) {
  const records = [];
  const writes = [];
  const preferenceWrites = [];
  let marketingOptIn = initialMarketingOptIn;
  let reads = 0;
  const core = loadTs("lib/legal-consent.ts", {
    "server-only": {}, "@/lib/legal-documents": { LEGAL_DOCUMENTS: documents },
    "node:fs": { readFileSync: () => { throw Object.assign(new Error("No local fixture"), { code: "ENOENT" }); } },
  }, { process: { env: { NODE_ENV: "development" } } });
  const actions = loadTs("app/auth/legal-actions.ts", {
    "@/lib/restore-signup-consent": { restoreSignupConsent: async () => null },
    "@/lib/auth-server-data": { getAuthUser: async () => ({ data: { user: currentUser }, error: authError }) },
    "@/lib/legal-consent": core,
    "@/lib/account-marketing-consent": { getAccountMarketingConsent: async () => marketingOptIn,
      saveAccountMarketingConsent: async (account, choice) => {
      assert.equal(account.id, currentUser.id);
      assert.equal(typeof choice, "boolean");
      preferenceWrites.push(choice);
      if (preferenceError) throw preferenceError;
      marketingOptIn = choice;
    } },
    "@/lib/supabase/server": { createClient: async () => ({ from: (table) => {
      if (table === "users") return { select: () => ({ eq: (key, value) => {
        assert.equal(key, "id"); assert.equal(value, currentUser.id);
        return { maybeSingle: async () => ({ data: { marketing_opt_in: marketingOptIn }, error: null }) };
      } }) };
      assert.equal(table, "user_legal_consents");
      return { select: () => ({ eq: async (key, value) => {
        reads++;
        assert.equal(key, "user_id"); assert.equal(value, currentUser.id);
        return { data: records.filter((row) => row.user_id === value), error: readError };
      } }) };
    } }) },
    "@/lib/supabase/service": { createServiceClient: () => ({ from: (table) => ({ upsert: async (rows, options) => {
      assert.equal(table, "user_legal_consents");
      writes.push({ rows, options });
      if (!writeError) for (const row of rows) {
        if (!records.some((item) => item.user_id === row.user_id && item.document_kind === row.document_kind && item.document_version === row.document_version && item.document_hash === row.document_hash)) records.push({ ...row, accepted_at: "database-time" });
      }
      return { error: writeError };
    } }) }) },
  });
  const input = () => ({ expectedUserId: user.id, revision: core.currentLegalDocuments().revision, termsAgreed: true, privacyAgreed: true });
  return { ...actions, core, documents, records, writes, preferenceWrites, marketing: () => marketingOptIn, input, reads: () => reads };
}

test("signed out accounts never read or write consent records", async () => {
  const f = fixture({ currentUser: null });
  assert.deepEqual(await f.getLegalConsentStateAction(), { status: "signed_out" });
  assert.equal((await f.acceptLegalDocumentsAction(f.input())).ok, false);
  assert.equal(f.reads(), 0); assert.equal(f.writes.length, 0);
});

test("missing legal documents skip the dialog without inventing accepted history or accessing its table", async () => {
  const f = fixture({ documents: [] });
  assert.deepEqual(await f.getLegalConsentStateAction(), { status: "not_configured" });
  assert.equal((await f.acceptLegalDocumentsAction(f.input())).ok, false);
  assert.equal(f.reads(), 0);
  assert.equal(f.writes.length, 0);
});

test("failed user verification cannot silently hide the consent check for an existing browser session", async () => {
  const f = fixture({ currentUser: null, authError: { message: "private authentication detail" } });
  const state = await f.getLegalConsentStateAction();
  assert.equal(state.status, "error");
  assert.doesNotMatch(state.message, /private/);
  assert.equal((await f.acceptLegalDocumentsAction(f.input())).ok, false);
  assert.equal(f.reads(), 0);
  assert.equal(f.writes.length, 0);
});

test("new accounts require both documents and save verified snapshots with database timestamps", async () => {
  const f = fixture();
  const state = await f.getLegalConsentStateAction();
  assert.equal(state.status, "required");
  assert.deepEqual(state.missing, ["terms", "privacy"]);
  const input = { ...f.input(), accepted_at: "forged", user_id: "another-account", document_content: "forged" };
  assert.deepEqual(await f.acceptLegalDocumentsAction(input), { ok: true });
  assert.equal(f.writes[0].rows.length, 2);
  for (const row of f.writes[0].rows) {
    assert.equal(row.user_id, user.id);
    assert.equal(row.document_version, "2026-10-23");
    assert.equal(Object.hasOwn(row, "accepted_at"), false);
    assert.notEqual(row.document_content, "forged");
    assert.match(row.document_hash, /^[a-f0-9]{64}$/);
  }
  assert.equal((await f.getLegalConsentStateAction()).status, "current");
});

test("retrying the same consent preserves original history and acceptance time", async () => {
  const f = fixture();
  await f.acceptLegalDocumentsAction(f.input());
  const before = structuredClone(f.records);
  await f.acceptLegalDocumentsAction(f.input());
  assert.equal(f.writes[1].options.ignoreDuplicates, true);
  assert.deepEqual(f.records, before);
});

test("editing a document without changing its posting date invalidates only that document", async () => {
  const f = fixture();
  await f.acceptLegalDocumentsAction(f.input());
  const oldRevision = f.input();
  f.documents[1].content = "Changed privacy notice.";
  const state = await f.getLegalConsentStateAction();
  assert.equal(state.status, "required");
  assert.deepEqual(state.missing, ["privacy"]);
  const stale = await f.acceptLegalDocumentsAction(oldRevision);
  assert.equal(stale.ok, false); assert.equal(stale.refresh, true);
  assert.equal(f.writes.length, 1);
  await f.acceptLegalDocumentsAction(f.input());
  assert.equal(f.records.length, 3, "Old snapshots must remain unchanged");
});

test("updating a title or posting date also requests renewed consent", async () => {
  for (const key of ["title", "postedOn"]) {
    const f = fixture();
    await f.acceptLegalDocumentsAction(f.input());
    f.documents[0][key] = key === "postedOn" ? "2026-10-24" : `${f.documents[0][key]} changed`;
    assert.deepEqual((await f.getLegalConsentStateAction()).missing, ["terms"]);
  }
});

test("an incomplete required document set cannot produce consent records", async () => {
  const f = fixture({ documents: definitions().slice(0, 1) });
  assert.equal((await f.acceptLegalDocumentsAction(f.input())).ok, false);
  assert.equal(f.writes.length, 0);
});

test("all required checkboxes must be explicit booleans and the displayed account must still match", async () => {
  for (const input of [
    { termsAgreed: false }, { privacyAgreed: false }, { termsAgreed: "true" },
    { expectedUserId: "another-account" }, { revision: "old-revision" }, { marketingAgreed: "true" },
  ]) {
    const f = fixture();
    assert.equal((await f.acceptLegalDocumentsAction({ ...f.input(), ...input })).ok, false);
    assert.equal(f.writes.length, 0);
  }
});

test("optional marketing selection preserves the stored choice and accepts both yes and no", async () => {
  for (const choice of [true, false]) {
    const f = fixture({ initialMarketingOptIn: true });
    assert.equal((await f.getLegalConsentStateAction()).marketingOptIn, true);
    assert.equal((await f.acceptLegalDocumentsAction({ ...f.input(), marketingAgreed: choice })).ok, true);
    assert.deepEqual(f.preferenceWrites, [choice]);
    assert.equal(f.marketing(), choice);
  }
  const legacy = fixture({ initialMarketingOptIn: true });
  await legacy.acceptLegalDocumentsAction(legacy.input());
  assert.equal(legacy.marketing(), true);
  assert.deepEqual(legacy.preferenceWrites, []);
});

test("failed marketing preference writes cannot falsely complete the required consent flow", async () => {
  const f = fixture({ preferenceError: { message: "private preference error" } });
  const result = await f.acceptLegalDocumentsAction({ ...f.input(), marketingAgreed: true });
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /private/);
  assert.equal(f.writes.length, 0);
  assert.equal((await f.getLegalConsentStateAction()).status, "required");
});

test("read or write failures do not look like accepted documents and never leak private errors", async () => {
  const read = await fixture({ readError: { message: "private schema detail" } }).getLegalConsentStateAction();
  assert.equal(read.status, "error"); assert.doesNotMatch(read.message, /private/);
  const f = fixture({ writeError: { message: "private write detail" } });
  const result = await f.acceptLegalDocumentsAction(f.input());
  assert.equal(result.ok, false); assert.doesNotMatch(result.error, /private/);
  assert.equal((await f.getLegalConsentStateAction()).status, "required");
});
