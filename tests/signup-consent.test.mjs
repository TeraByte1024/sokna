import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";

const env = { NODE_ENV: "development", SUPABASE_SECRET_KEY: "isolated-signing-key" };
const documents = ["terms", "privacy"].map((kind) => ({ kind, title: kind, content: `Test ${kind}`, postedOn: "2026-10-23", published: true }));
const core = loadTs("lib/legal-consent.ts", { "server-only": {}, "@/lib/legal-documents": { LEGAL_DOCUMENTS: documents, LEGAL_DOCUMENT_HISTORY: [] } });
const signing = loadTs("lib/signup-consent.ts", { "server-only": {} }, { process: { env } });
const base = () => ({ method: "email", email: "new@example.test", revision: core.currentLegalDocuments().revision,
  acceptedAt: Date.now(), marketingAgreed: false, preview: false });
const userFor = (ticket) => ({ id: "verified-user", email: ticket.email, created_at: new Date(ticket.acceptedAt + 1000).toISOString(), app_metadata: { provider: ticket.method } });

test("pre-signup receipts reject tampering, malformed choices, expiry, future times and production previews", () => {
  const initial = base(), token = signing.signSignupConsent(initial);
  assert.deepEqual(signing.readSignupConsent(token), initial);
  assert.equal(signing.readSignupConsent(`${token}x`), null);
  for (const changes of [{ acceptedAt: Date.now() + 10000 }, { acceptedAt: Date.now() - 8 * 86400_000 }, { marketingAgreed: "true" }, { revision: "forged" }, { method: "admin" }]) {
    assert.equal(signing.readSignupConsent(signing.signSignupConsent({ ...base(), ...changes })), null);
  }
  const production = loadTs("lib/signup-consent.ts", { "server-only": {} }, { process: { env: { ...env, NODE_ENV: "production" } } });
  assert.equal(production.readSignupConsent(signing.signSignupConsent({ ...base(), preview: true })), null);
  const ticket = base();
  assert.equal(signing.signupConsentMatchesUser(ticket, userFor(ticket)), true);
  assert.equal(signing.signupConsentMatchesUser(ticket, { ...userFor(ticket), email: "other@example.test" }), false);
  assert.equal(signing.signupConsentMatchesUser(ticket, { ...userFor(ticket), created_at: "2020-01-01" }), false);
});

function actionFixture({ current = core.currentLegalDocuments(), authError = null } = {}) {
  const signups = [], cookieWrites = [];
  const actions = loadTs("app/auth/signup-actions.ts", {
    "@/lib/legal-consent": { currentLegalDocuments: () => current },
    "@/lib/signup-consent": signing,
    "next/headers": { headers: async () => new Headers({ origin: "http://localhost:3000" }), cookies: async () => ({ set: (...args) => cookieWrites.push(args) }) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { signUp: async (input) => { signups.push(input); return { data: { session: {} }, error: authError }; } } }) },
  }, { process: { env } });
  return { ...actions, signups, cookieWrites };
}
const choice = () => ({ method: "email", email: "new@example.test", revision: base().revision, termsAgreed: true, privacyAgreed: true, marketingAgreed: false });

test("no account can be submitted through the signup action without current signed prior consent", async () => {
  const f = actionFixture();
  for (const changes of [{ termsAgreed: false }, { privacyAgreed: false }, { termsAgreed: "true" }, { marketingAgreed: "false" }, { revision: "stale" }]) {
    assert.equal((await f.prepareSignupConsentAction({ ...choice(), ...changes })).ok, false);
  }
  for (const token of ["", "forged", signing.signSignupConsent({ ...base(), email: "other@example.test" }), signing.signSignupConsent({ ...base(), acceptedAt: Date.now() - 7200_000 })]) {
    assert.equal((await f.signUpWithConsentAction({ email: "new@example.test", password: "safe-password", token })).ok, false);
  }
  assert.equal(f.signups.length, 0);
  const receipt = await f.prepareSignupConsentAction(choice());
  assert.equal(receipt.ok, true);
  assert.equal(f.signups.length, 0, "Preparing agreement never creates an account");
  assert.equal((await f.signUpWithConsentAction({ email: "new@example.test", password: "safe-password", token: receipt.token, next: "//evil.test" })).hasSession, true);
  assert.equal(f.signups.length, 1);
  assert.equal(f.signups[0].options.data.marketing_opt_in, false);
  assert.equal(f.signups[0].options.data.signup_legal_consent, receipt.token);
  assert.equal(new URL(f.signups[0].options.emailRedirectTo).searchParams.get("next"), "/");
});

test("social pre-consent creates only a protected callback receipt and no account", async () => {
  const f = actionFixture();
  const result = await f.prepareSignupConsentAction({ ...choice(), method: "google" });
  assert.equal(result.ok, true);
  assert.equal(f.signups.length, 0);
  assert.equal(f.cookieWrites.length, 1);
  assert.equal(f.cookieWrites[0][2].httpOnly, true);
  assert.equal(f.cookieWrites[0][2].sameSite, "lax");
  assert.equal(f.cookieWrites[0][1].split(".")[1], result.consentState);
  assert.equal((await actionFixture({ current: { documents: [], revision: "", published: false } }).getSignupLegalDocumentsAction()).ok, false);
});

test("one agreement before signup methods binds to email or social without collecting agreement twice", async () => {
  const f = actionFixture();
  const initial = await f.prepareSignupConsentAction({ ...choice(), method: "signup" });
  assert.equal(initial.ok, true);
  assert.equal(f.signups.length, 0); assert.equal(f.cookieWrites.length, 0);
  const original = signing.readSignupConsent(initial.token);
  const email = await f.signUpWithConsentAction({ email: "new@example.test", password: "safe-password", token: initial.token });
  assert.equal(email.ok, true);
  const bound = signing.readSignupConsent(f.signups[0].options.data.signup_legal_consent);
  assert.equal(bound.method, "email"); assert.equal(bound.email, "new@example.test");
  assert.equal(bound.acceptedAt, original.acceptedAt);
  for (const method of ["google", "kakao"]) {
    const social = await f.bindSocialSignupConsentAction({ method, token: initial.token });
    assert.equal(social.ok, true);
    assert.equal(signing.readSignupConsent(social.token).method, method);
    assert.equal(signing.readSignupConsent(social.token).acceptedAt, original.acceptedAt);
  }
});

test("signup displays agreement before rendering any email or social signup methods", async () => {
  const values = [], effects = [], prepared = [], navigations = [];
  let index = 0;
  const { SignupFlow } = loadTs("components/signup-flow.tsx", {
    react: { useState: (initial) => { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], (value) => { values[slot] = value; }]; }, useEffect: (effect) => effects.push(effect) },
    "next/navigation": { useRouter: () => ({ push: (url) => navigations.push(url) }) },
    "@/components/sign-up-form": { SignUpForm: "signup-form" },
    "@/components/legal-consent-dialog": { LegalConsentDialog: "consent-dialog" },
    "@/components/ui/button": { Button: "button" },
    "@/app/auth/signup-actions": { getSignupLegalDocumentsAction: async () => ({ ok: true, ...core.currentLegalDocuments() }),
      prepareSignupConsentAction: async (input) => { prepared.push(input); return { ok: true, token: "signed-before-method" }; } },
  });
  const render = () => { index = 0; return SignupFlow({ next: "/gigs" }); };
  const initial = render(); assert.notEqual(initial.type, "signup-form");
  effects[0](); await new Promise(setImmediate);
  const prompt = render().props.children.find((child) => child?.type === "consent-dialog");
  assert.ok(prompt); assert.deepEqual(prepared, []);
  prompt.props.beforeSignup.onCancel();
  assert.deepEqual(navigations, ["/auth/login?redirect=%2Fgigs"]); assert.deepEqual(prepared, []);
  await prompt.props.beforeSignup.onAccept({ revision: base().revision, termsAgreed: true, privacyAgreed: true, marketingAgreed: false });
  const methods = render(); assert.equal(methods.type, "signup-form");
  assert.equal(methods.props.consentToken, "signed-before-method");
  assert.equal(prepared[0].method, "signup");
});

function recordFixture({ preferenceError = null, preview = false } = {}) {
  const records = [], writes = [], choices = [];
  const current = preview ? { ...core.currentLegalDocuments(), published: false } : core.currentLegalDocuments();
  const { recordSignupConsent } = loadTs("lib/record-signup-consent.ts", {
    "server-only": {}, "@/lib/signup-consent": signing,
    "@/lib/legal-consent": { legalDocumentsAtRevision: (revision) => revision === current.revision ? current : null },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: records, error: null }) }) }) }) },
    "@/lib/account-marketing-consent": { saveAccountMarketingConsent: async (_user, choice) => { choices.push(choice); if (preferenceError) throw preferenceError; } },
    "@/lib/supabase/service": { createServiceClient: () => ({ from: () => ({ upsert: async (rows, options) => {
      assert.equal(options.ignoreDuplicates, true); writes.push(rows); records.push(...rows); return { error: null };
    } }) }) },
  });
  return { recordSignupConsent, records, writes, choices };
}

test("verified signup restores signed consent time and optional choice once without asking again", async () => {
  const f = recordFixture();
  const ticket = { ...base(), marketingAgreed: true };
  const token = signing.signSignupConsent(ticket), user = userFor(ticket);
  assert.equal((await f.recordSignupConsent(user, token)).preview, false);
  assert.deepEqual(f.choices, [true]);
  assert.equal(f.records.length, 2);
  assert.equal(f.records[0].accepted_at, new Date(ticket.acceptedAt).toISOString());
  assert.equal(f.records[0].user_id, user.id);
  assert.equal(f.records[0].document_version, "2026-10-23");
  await f.recordSignupConsent(user, token);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.choices, [true], "A later marketing withdrawal must not be overwritten by a receipt replay");
  assert.equal(await f.recordSignupConsent({ ...user, email: "other@example.test" }, token), null);
  const failed = recordFixture({ preferenceError: new Error("private") });
  await assert.rejects(failed.recordSignupConsent(user, token));
  assert.equal(failed.writes.length, 0);
});

test("local pre-signup preview never writes consent history or marketing preferences", async () => {
  const f = recordFixture({ preview: true }), ticket = { ...base(), preview: true };
  assert.equal((await f.recordSignupConsent(userFor(ticket), signing.signSignupConsent(ticket))).preview, true);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.choices, []);
});

test("a cancelled pre-signup dialog never prepares acceptance or starts authentication", async () => {
  const values = [], prepared = [];
  let index = 0;
  const { useSignupConsent } = loadTs("components/signup-consent.tsx", {
    react: { useRef: (initial) => { const slot = index++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; },
      useState: (initial) => { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], (value) => { values[slot] = value; }]; }, useEffect() {} },
    "@/components/legal-consent-dialog": { LegalConsentDialog: "consent-dialog" },
    "@/app/auth/signup-actions": { getSignupLegalDocumentsAction: async () => ({ ok: true, ...core.currentLegalDocuments() }), prepareSignupConsentAction: async (input) => prepared.push(input) },
  });
  let hook = useSignupConsent("email", "new@example.test");
  const pending = hook.request();
  await new Promise(setImmediate); index = 0; hook = useSignupConsent("email", "new@example.test");
  assert.equal(hook.dialog.type, "consent-dialog");
  hook.dialog.props.beforeSignup.onCancel();
  assert.equal(await pending, null); assert.deepEqual(prepared, []);
});

test("stale social callback receipts reject before exchanging a session", async () => {
  const operations = [];
  const { GET } = loadTs("app/auth/callback/route.ts", {
    "@/lib/signup-consent": signing, "@/lib/record-signup-consent": { recordSignupConsent: async () => { throw new Error("must not record"); } },
    "next/headers": { cookies: async () => ({ get: () => ({ value: signing.signSignupConsent({ ...base(), method: "google" }) }) }) },
    "@/lib/supabase/server": { createClient: async () => { operations.push("auth"); throw new Error("must not authenticate"); } },
    "next/server": { NextResponse: { redirect: (url) => String(url) } },
  });
  const result = await GET(new Request("https://sokna.example/auth/callback?code=mock&consent_state=wrong&next=%2Fgigs"));
  assert.match(result, /\/auth\/sign-up\?/); assert.deepEqual(operations, []);
});
