import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);
const APPLICANT_ID = "11111111-2222-4333-8444-555555555555";
const APPLIED_AT = "2026-09-27T03:04:05.123Z";
const EVENT_KEY = `member-application:${APPLICANT_ID}:${APPLIED_AT}`;
const delayMessage = "가입 요청은 완료됐지만 관리자 푸시 발송이 지연되고 있습니다.";

function loadSource(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) {
      const base = path.join(root, name.slice(2));
      const resolved = [base, base + ".ts", base + ".tsx"].find(existsSync);
      if (resolved) return loadSource(path.relative(root, resolved), mocks);
    }
    return requireDependency(name);
  };
  vm.runInThisContext(`(function(require,module,exports,window,console){${source}\n})`, { filename })(
    localRequire, loadedModule, loadedModule.exports,
    { location: { origin: "https://sokna.example" } },
    { error() {} },
  );
  return loadedModule.exports;
}

function fixture({
  applicant = { applied_at: APPLIED_AT }, queryError = null, createError = null,
  dispatchError = null, pending = [],
} = {}) {
  const queries = [];
  const dispatches = [];
  const processed = [];
  let serviceCalls = 0;
  const client = {
    from(table) {
      const query = { table, columns: null, filters: [] };
      queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        async maybeSingle() { return { data: queryError ? null : applicant, error: queryError }; },
      };
      return builder;
    },
  };
  const action = loadSource("app/auth/sign-up/actions.ts", {
    "@/lib/supabase/service": { createServiceClient() {
      serviceCalls++;
      if (createError) throw createError;
      return client;
    } },
    "@/lib/push-notifications": { async processPendingPushNotifications(options) {
      dispatches.push(options);
      if (dispatchError) throw dispatchError;
      const selected = pending.filter((item) =>
        (!options.eventType || item.eventType === options.eventType)
        && (!options.eventKey || item.eventKey === options.eventKey),
      ).slice(0, options.limit ?? 50);
      processed.push(...selected.map((item) => item.id));
      return { processedCount: selected.length, sentCount: selected.length };
    } },
  }).dispatchSignupPushNotificationsAction;
  return { action, queries, dispatches, processed, serviceCalls: () => serviceCalls };
}

test("email signup without a session dispatches only its database-backed application event", async () => {
  const f = fixture({ applicant: { applied_at: "2026-09-27T12:04:05.123456+09:00" } });
  assert.deepEqual(await f.action(APPLICANT_ID), { ok: true });
  assert.deepEqual(f.queries, [{ table: "users", columns: "applied_at", filters: [["id", APPLICANT_ID]] }]);
  assert.deepEqual(f.dispatches, [{ eventType: "member_approval_requested", eventKey: EVENT_KEY }]);
});

test("an unrelated signup backlog cannot consume the new applicant's immediate dispatch batch", async () => {
  const backlog = Array.from({ length: 100 }, (_, index) => ({
    id: `older-${index}`, eventType: "member_approval_requested", eventKey: `older-application-${index}`,
  }));
  const f = fixture({ pending: [
    ...backlog,
    { id: "current-signup", eventType: "member_approval_requested", eventKey: EVENT_KEY },
    { id: "different-type", eventType: "member_approved", eventKey: EVENT_KEY },
  ] });
  assert.deepEqual(await f.action(APPLICANT_ID), { ok: true });
  assert.deepEqual(f.processed, ["current-signup"]);
});

test("missing or malformed applicant IDs are indistinguishable no-ops without database access", async () => {
  for (const value of [undefined, null, "", "not-a-uuid", "11111111", {}, 123,
    `${APPLICANT_ID} `, `${APPLICANT_ID},id.not.is.null`]) {
    const f = fixture({ createError: new Error("Database must not be called") });
    assert.deepEqual(await f.action(value), { ok: true });
    assert.equal(f.serviceCalls(), 0);
    assert.deepEqual(f.dispatches, []);
  }
});

test("a well-formed unknown applicant ID is the same public no-op", async () => {
  const f = fixture({ applicant: null });
  assert.deepEqual(await f.action(APPLICANT_ID), { ok: true });
  assert.deepEqual(f.dispatches, []);
  assert.deepEqual(f.queries[0].filters, [["id", APPLICANT_ID]]);
});

test("public success never exposes whether an account exists or how many administrators were notified", async () => {
  const unknown = fixture({ applicant: null });
  const empty = fixture();
  const delivered = fixture({ pending: [
    { id: "admin-one", eventType: "member_approval_requested", eventKey: EVENT_KEY },
    { id: "admin-two", eventType: "member_approval_requested", eventKey: EVENT_KEY },
  ] });
  const responses = await Promise.all([unknown.action(APPLICANT_ID), empty.action(APPLICANT_ID), delivered.action(APPLICANT_ID)]);
  assert.deepEqual(responses, [{ ok: true }, { ok: true }, { ok: true }]);
  assert.deepEqual(delivered.processed, ["admin-one", "admin-two"]);
});

test("UUID casing is normalized before both lookup and event-key construction", async () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const f = fixture();
  assert.deepEqual(await f.action(id.toUpperCase()), { ok: true });
  assert.deepEqual(f.queries[0].filters, [["id", id]]);
  assert.equal(f.dispatches[0].eventKey, `member-application:${id}:${APPLIED_AT}`);
});

test("database lookup errors return only the generic delivery-delay message", async () => {
  const f = fixture({ queryError: { message: "private database detail", code: "XX123" } });
  assert.deepEqual(await f.action(APPLICANT_ID), { ok: false, error: delayMessage });
  assert.deepEqual(f.dispatches, []);
});

test("service setup and push delivery failures use the same generic delay response", async () => {
  for (const options of [
    { createError: new Error("private setup detail") },
    { dispatchError: new Error("private provider detail") },
  ]) {
    const f = fixture(options);
    assert.deepEqual(await f.action(APPLICANT_ID), { ok: false, error: delayMessage });
    assert.deepEqual(f.processed, []);
  }
});

test("invalid stored timestamps cannot fall back to a broad event-type dispatch", async () => {
  const f = fixture({ applicant: { applied_at: "invalid timestamp" } });
  assert.deepEqual(await f.action(APPLICANT_ID), { ok: false, error: delayMessage });
  assert.deepEqual(f.dispatches, []);
});

function signupFormFixture(user, options = {}) {
  const signups = [];
  const dispatches = [];
  const navigation = [];
  const submitted = [];
  const stateValues = [
    "new@example.test", options.password ?? "secure-password", options.repeatPassword ?? "secure-password",
    null, false,
  ];
  let stateIndex = 0;
  const stub = () => null;
  const mocks = {
    react: { useState: () => {
      const index = stateIndex++;
      return [stateValues[index], (value) => { stateValues[index] = value; }];
    } },
    "@/lib/utils": { cn: (...items) => items.filter(Boolean).join(" ") },
    "@/app/auth/signup-actions": { signUpWithConsentAction: async (payload) => {
      if (!payload.token) return { ok: false, error: "prior consent required" };
      signups.push(payload);
      return { ok: true, hasSession: Boolean(options.session) };
    } },
    "@/components/ui/button": { Button: stub },
    "@/components/ui/card": { Card: stub, CardContent: stub, CardDescription: stub, CardHeader: stub, CardTitle: stub },
    "@/components/ui/input": { Input: stub },
    "@/components/ui/label": { Label: stub },
    "@/components/ui/checkbox": { Checkbox: stub },
    "next/link": stub,
    "next/navigation": { useRouter: () => ({ push: (url) => navigation.push(url), refresh() {} }) },
    "@/components/google-sign-in-button": { GoogleSignInButton: stub },
    "@/components/kakao-sign-in-button": { KakaoSignInButton: stub },
    "@/components/member-profile-fields": { MemberProfileFields: stub },
    "@/components/ui/leave-confirm-dialog": {
      LeaveConfirmDialog: stub,
      useUnsavedChangesWarning: () => ({
        showLeaveModal: false, cancelLeave() {}, confirmLeave() {}, markSubmitting: () => submitted.push(true),
      }),
    },
    "@/app/auth/sign-up/actions": { dispatchSignupPushNotificationsAction: async (id) => {
      dispatches.push(id); return { ok: true };
    } },
  };
  const { SignUpForm } = loadSource("components/sign-up-form.tsx", mocks);
  let tree;
  const render = () => {
    stateIndex = 0;
    tree = SignUpForm({ next: "/gigs/42", consentToken: options.missingConsent ? undefined : "signed-prior-consent" });
    return tree;
  };
  render();
  const findForm = (element) => {
    if (!element || typeof element !== "object") return null;
    if (element.type === "form") return element;
    const children = element.props?.children;
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
      const found = findForm(child);
      if (found) return found;
    }
    return null;
  };
  const nodes = (element) => {
    if (Array.isArray(element)) return element.flatMap((child) => nodes(child));
    if (!element || typeof element !== "object") return [];
    return [element, ...nodes(element.props?.children)];
  };
  return { get form() { return findForm(tree); }, nodes: () => nodes(tree), render, dispatches, navigation, submitted, signups };
}

test("account creation never submits membership metadata or requests admin approval", async () => {
  for (const user of [{ id: APPLICANT_ID }, null]) {
    const f = signupFormFixture(user);
    await f.form.props.onSubmit({ preventDefault() {} });
    assert.deepEqual(f.signups[0], { email: "new@example.test", password: "secure-password", token: "signed-prior-consent", next: "/gigs/42" });
    assert.deepEqual(f.dispatches, []);
    assert.deepEqual(f.navigation, ["/auth/sign-up-success?redirect=%2Fgigs%2F42"]);
    assert.deepEqual(f.submitted, [true]);
    assert.equal(f.nodes().some((e) => e.props?.id === "is-sokna-member"), false);
    assert.equal(f.nodes().some((e) => Object.hasOwn(e.props ?? {}, "selectedPreset")), false);
    const providers = f.nodes().filter((e) => ["Google로 가입하기", "카카오로 가입하기"].includes(e.props?.text));
    assert.equal(providers.length, 2);
    assert.ok(providers.every((e) => e.props.intent === "signup" && e.props.next === "/gigs/42"));
  }
});

test("email signup never creates an account without prior consent or valid matching passwords", async () => {
  for (const options of [
    { missingConsent: true },
    { password: "short", repeatPassword: "short" }, { repeatPassword: "different" },
  ]) {
    const f = signupFormFixture({ id: APPLICANT_ID }, options);
    await f.form.props.onSubmit({ preventDefault() {} });
    assert.deepEqual(f.signups, []);
    assert.deepEqual(f.dispatches, []);
    assert.deepEqual(f.navigation, []);
  }
});

test("a successfully authenticated signup opens the optional second step rather than creating a membership application", async () => {
  const f = signupFormFixture({ id: APPLICANT_ID }, { session: { access_token: "mock" } });
  await f.form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(f.navigation, ["/auth/membership?redirect=%2Fgigs%2F42"]);
  assert.deepEqual(f.dispatches, []);
});
