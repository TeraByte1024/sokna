import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);

function loadSource(relativePath, mocks, cache = new Map()) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (resolved) return loadSource(path.relative(root, resolved), mocks, cache);
    }
    return requireDependency(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const member = (id, overrides = {}) => ({
  id, name: id, generation: 40, part: "기타", status: "pending",
  email: `${id}@example.com`, applied_at: "2026-09-26T00:00:00Z",
  approved_at: null, marketing_opt_in: false, ...overrides,
});
const draft = () => member("social-draft", { generation: null, part: null });
const fragment = ({ children }) => React.createElement(React.Fragment, null, children);

function fixture(rows, { isAdmin = true, userId = "admin", queryError = null, saveError = null } = {}) {
  const notifications = [];
  const invalidations = [];
  const pushBatches = [];
  const client = {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: userId, email: `${userId}@example.com` } } }),
      getUser: async () => ({ data: { user: { id: userId, email: `${userId}@example.com`, user_metadata: {} } } }),
      exchangeCodeForSession: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from(table) {
      let items = table === "users" ? rows : table === "admins" ? [{ id: "admin" }] : [];
      const predicates = [];
      const result = () => ({ data: queryError ? null : items.filter((item) => predicates.every((predicate) => predicate(item))), error: queryError });
      const query = {
        select() { return query; },
        eq(key, value) { predicates.push((item) => item[key] === value); return query; },
        gte(key, value) { predicates.push((item) => item[key] != null && item[key] >= value); return query; },
        not(key, operator, value) { assert.equal(operator, "is"); predicates.push((item) => item[key] !== value); return query; },
        neq(key, value) { predicates.push((item) => item[key] != null && item[key] !== value); return query; },
        in(key, values) { predicates.push((item) => values.includes(item[key])); return query; },
        order() { return query; },
        maybeSingle: async () => ({ ...result(), data: result().data?.[0] ?? null }),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
        async upsert(payload) {
          if (saveError) return { error: saveError };
          const existing = rows.find((item) => item.id === payload.id);
          if (existing) Object.assign(existing, payload);
          else rows.push(payload);
          return { error: null };
        },
        insert(payload) {
          assert.equal(table, "notifications");
          items = payload.map((item, index) => ({ ...item, id: index + 1 }));
          notifications.push(...items);
          return query;
        },
      };
      return query;
    },
  };
  const mocks = {
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
    "next/navigation": { redirect: (url) => { throw new Error(`redirect:${url}`); } },
    "@/lib/auth-admin": { getIsAdmin: async () => isAdmin },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/service": { createServiceClient: () => client },
    "@/lib/push-notifications": {
      processPendingPushNotificationsByIds: async (ids) => pushBatches.push(ids),
    },
    "./user-profile-menu": { UserProfileMenu: () => null },
    "@/components/site-layout": { SiteLayout: fragment },
    "@/components/page-container": { PageContainer: fragment },
    "./admin-members-client": {
      AdminMembersClient: ({ initialPendingMembers }) => React.createElement("div", null, initialPendingMembers.map((item) => item.id).join(",")),
    },
    "@/components/gigs/gig-rsvp-manager": { GigRsvpManager: () => null },
    "./complete-profile-form": { CompleteProfileForm: () => React.createElement("div", null, "registration-form") },
    "./profile-form": { ProfileForm: () => React.createElement("div", null, "profile-form") },
  };
  return { client, notifications, invalidations, pushBatches, load: (file) => loadSource(file, mocks) };
}

test("admin initial and refreshed lists exclude social drafts and malformed profiles", async () => {
  const f = fixture([
    draft(), member("email-applicant"), member("custom-session", { part: "바이올린" }),
    member("missing-part", { part: null }), member("blank-part", { part: "  " }),
    member("missing-generation", { generation: null }), member("zero-generation", { generation: 0 }),
    member("approved", { status: "approved" }), member("rejected", { status: "rejected" }),
  ]);
  const response = await f.load("app/admin/members/actions.ts").getPendingMembersAction();
  assert.equal(response.ok, true);
  assert.deepEqual(response.data.map((item) => item.id), ["email-applicant", "custom-session"]);
  const page = await f.load("app/admin/members/page.tsx").default();
  assert.equal(renderToStaticMarkup(page), "<div>email-applicant,custom-session</div>");
});

test("admin header count includes only submitted applications", async () => {
  const f = fixture([draft(), member("applicant")]);
  const html = renderToStaticMarkup(await f.load("components/auth-button.tsx").AuthButton());
  assert.match(html, />1</);
  assert.doesNotMatch(html, />2</);
  assert.equal(f.notifications.length, 0);
});

test("social login alone produces no admin count or applicant pending badge", async () => {
  for (const isAdmin of [true, false]) {
    const f = fixture([draft()], { isAdmin, userId: "social-draft" });
    const html = renderToStaticMarkup(await f.load("components/auth-button.tsx").AuthButton());
    assert.doesNotMatch(html, /승인 대기 중|animate-pulse|>1</);
    assert.equal(f.notifications.length, 0);
  }
});

test("submitting a valid social application adds the row, badge, and notification", async () => {
  const rows = [draft()];
  const applicant = fixture(rows, { isAdmin: false, userId: "social-draft" });
  const result = await applicant.load("app/auth/complete-profile/actions.ts").completeProfileAction("Applicant", 40, " 바이올린 ", false);
  assert.equal(result.ok, true);
  assert.equal(rows[0].part, "바이올린");
  assert.equal(applicant.notifications.length, 1);
  assert.deepEqual(applicant.pushBatches, [[1]]);
  assert.ok(applicant.invalidations.some(([url, type]) => url === "/" && type === "layout"));
  const html = renderToStaticMarkup(await applicant.load("components/auth-button.tsx").AuthButton());
  assert.match(html, /승인 대기 중/);
  const admin = fixture(rows);
  const response = await admin.load("app/admin/members/actions.ts").getPendingMembersAction();
  assert.deepEqual(response.data.map((item) => item.id), ["social-draft"]);
});

test("invalid profile submissions never enter the approval queue or send notifications", async () => {
  for (const generation of [0, -1, NaN, Infinity, 1.5]) {
    const rows = [draft()];
    const f = fixture(rows, { isAdmin: false, userId: "social-draft" });
    const result = await f.load("app/auth/complete-profile/actions.ts").completeProfileAction("Applicant", generation, "기타", false);
    assert.equal(result.ok, false);
    assert.equal(rows[0].generation, null);
    assert.equal(f.notifications.length, 0);
  }
});

test("failed profile saves leave the draft hidden and do not notify admins", async () => {
  const rows = [draft()];
  const f = fixture(rows, { isAdmin: false, userId: "social-draft", saveError: { message: "save failed" } });
  const result = await f.load("app/auth/complete-profile/actions.ts").completeProfileAction("Applicant", 40, "기타", false);
  assert.equal(result.ok, false);
  assert.equal(rows[0].generation, null);
  assert.equal(f.notifications.length, 0);
  assert.equal(f.invalidations.length, 0);
});

test("incomplete accounts stay on registration and cannot use the ordinary profile form", async () => {
  const f = fixture([draft()], { isAdmin: false, userId: "social-draft" });
  const registration = await f.load("app/auth/complete-profile/page.tsx").default();
  assert.match(renderToStaticMarkup(registration), /registration-form/);
  await assert.rejects(f.load("app/profile/page.tsx").default(), /redirect:\/auth\/complete-profile/);
});

test("approved members with optional missing sessions keep profile access", async () => {
  const f = fixture([member("approved", { status: "approved", part: null })], { isAdmin: false, userId: "approved" });
  assert.match(renderToStaticMarkup(await f.load("app/profile/page.tsx").default()), /profile-form/);
});

test("OAuth callback uses the same completion rule as the approval queue", async () => {
  for (const [profile, destination] of [
    [draft(), "/auth/complete-profile"],
    [member("blank", { part: "  " }), "/auth/complete-profile"],
    [member("submitted"), "/"],
  ]) {
    const f = fixture([profile], { isAdmin: false, userId: profile.id });
    const response = await f.load("app/auth/callback/route.ts").GET(new Request("http://localhost/auth/callback?code=test"));
    assert.equal(response.headers.get("location"), `http://localhost${destination}`);
  }
});

test("pending member queries retain admin authorization and report database errors", async () => {
  const visitor = fixture([member("applicant")], { isAdmin: false });
  assert.equal((await visitor.load("app/admin/members/actions.ts").getPendingMembersAction()).ok, false);
  const failed = fixture([], { queryError: { message: "query failed" } });
  const response = await failed.load("app/admin/members/actions.ts").getPendingMembersAction();
  assert.equal(response.ok, false);
  assert.equal(response.error, "query failed");
});
