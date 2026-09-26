import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);

// Use the existing TypeScript compiler with isolated Next/Supabase boundaries.
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

function actionsFixture(options = {}) {
  const writes = [];
  const invalidations = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: "member-id" } } }) },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, limit() { return query; },
        maybeSingle: async () => ({
          data: table === "gigs"
            ? options.gig ?? { visibility: options.privateGig ? "private" : "public", is_public: !options.privateGig }
            : options.performer ?? null,
          error: table === "gigs" ? options.gigError ?? null : options.performerError ?? null,
        }),
        upsert: async (payload) => { writes.push({ table, payload }); return { error: null }; },
      };
      return query;
    },
    rpc: async (name, payload) => { writes.push({ name, payload }); return { data: options.reviewed ?? true, error: options.rpcError ?? null }; },
  };
  const actions = loadSource("app/gigs/actions.ts", {
    "next/cache": { revalidatePath: (value) => invalidations.push(value) },
    "@/lib/auth-admin": { getIsAdmin: async () => Boolean(options.admin) },
    "@/lib/supabase/server": { createClient: async () => client },
  });
  return { actions, writes, invalidations };
}

function form(status = "going", part = "바이올린") {
  const data = new FormData();
  data.set("gig_id", "1");
  data.set("status", status);
  data.set("part", part);
  return data;
}

test("RSVP requires authentication, a choice, and a nonempty session", async () => {
  for (const [options, data] of [[{ signedOut: true }, form()], [{}, form("")], [{}, form("going", "  ")]]) {
    const fixture = actionsFixture(options);
    assert.equal((await fixture.actions.submitGigRsvp(data)).ok, false);
    assert.equal(fixture.writes.length, 0);
  }
});

test("registered performers and unauthorized private-gig requests cannot resubmit", async () => {
  for (const options of [{ performer: { id: 3 } }, { privateGig: true }]) {
    const fixture = actionsFixture(options);
    assert.equal((await fixture.actions.submitGigRsvp(form())).ok, false);
    assert.equal(fixture.writes.length, 0);
  }
});

test("signed-in members may apply to member-only and public gigs, including legacy member-only gigs", async () => {
  for (const gig of [
    { visibility: "members", is_public: false },
    { visibility: "public", is_public: true },
    { is_public: false },
    { visibility: null, is_public: false },
  ]) {
    const fixture = actionsFixture({ gig });
    assert.deepEqual(await fixture.actions.submitGigRsvp(form()), { ok: true });
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.writes[0].table, "gig_rsvps");
    assert.equal(fixture.writes[0].payload.user_id, "member-id");
  }
});

test("private visibility blocks non-admin RSVP even when the legacy flag says public", async () => {
  for (const is_public of [false, true]) {
    const fixture = actionsFixture({ gig: { visibility: "private", is_public } });
    const result = await fixture.actions.submitGigRsvp(form());
    assert.equal(result.ok, false);
    assert.match(result.error, /비공개/);
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.invalidations, []);
  }
});

test("RSVP still requires login for both member-only and public gigs", async () => {
  for (const visibility of ["members", "public"]) {
    const fixture = actionsFixture({ signedOut: true, gig: { visibility, is_public: visibility === "public" } });
    const result = await fixture.actions.submitGigRsvp(form());
    assert.equal(result.ok, false);
    assert.match(result.error, /로그인/);
    assert.deepEqual(fixture.writes, []);
  }
});

test("custom session is preserved and submission does not create a performer", async () => {
  const fixture = actionsFixture();
  assert.equal((await fixture.actions.submitGigRsvp(form("going", "  어쿠스틱 기타  "))).ok, true);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].table, "gig_rsvps");
  assert.equal(fixture.writes[0].payload.part, "어쿠스틱 기타");
  assert.equal(fixture.writes[0].payload.user_id, "member-id");
  assert.ok(fixture.invalidations.includes("/admin/members"));
});

test("not-going and undecided responses clear the session", async () => {
  for (const status of ["not_going", "undecided"]) {
    const fixture = actionsFixture();
    assert.equal((await fixture.actions.submitGigRsvp(form(status))).ok, true);
    assert.equal(fixture.writes[0].payload.part, null);
  }
});

test("non-admin review is rejected before DB writes", async () => {
  const fixture = actionsFixture();
  assert.equal((await fixture.actions.reviewGigRsvp(1, 2, "2026-09-26T12:00:00Z", "approve")).ok, false);
  assert.equal(fixture.writes.length, 0);
});

test("approval and ignore pass the exact request version to the atomic RPC", async () => {
  for (const decision of ["approve", "ignore"]) {
    const fixture = actionsFixture({ admin: true });
    assert.equal((await fixture.actions.reviewGigRsvp(1, 2, "2026-09-26T12:00:00.123456Z", decision)).ok, true);
    assert.equal(fixture.writes[0].name, "review_gig_rsvp");
    assert.equal(fixture.writes[0].payload.p_decision, decision);
    assert.equal(fixture.writes[0].payload.p_updated_at, "2026-09-26T12:00:00.123456Z");
    assert.ok(fixture.invalidations.includes("/gigs/1/nominations"));
    assert.ok(fixture.invalidations.includes("/admin/members"));
  }
});

test("stale review is an error and refreshes the gig", async () => {
  const fixture = actionsFixture({ admin: true, reviewed: false });
  assert.equal((await fixture.actions.reviewGigRsvp(1, 2, "2026-09-26T12:00:00Z", "approve")).ok, false);
  assert.ok(fixture.invalidations.includes("/gigs/1"));
});

test("missing approval RPC reports incomplete server setup", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const code of ["PGRST202", "42883"]) {
    const fixture = actionsFixture({ admin: true, rpcError: { code } });
    const result = await fixture.actions.reviewGigRsvp(1, 9, "2026-09-26T05:06:36.787Z", "approve");
    assert.equal(result.ok, false);
    assert.match(result.error, /서버 설정이 누락/);
    assert.equal(fixture.invalidations.length, 0);
  }
});

const gig = { id: 1, title: "테스트 공연", is_public: true };
const rsvp = { id: 2, gig_id: 1, user_id: "member-id", status: "going", part: "어쿠스틱 기타", note: "", updated_at: "2026-09-26T12:00:00Z" };
const uiMocks = {
  "next/navigation": { useRouter: () => ({ refresh() {} }), useSearchParams: () => new URLSearchParams("join=true") },
  "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
  "@/app/gigs/actions": { submitGigRsvp() {}, reviewGigRsvp() {} },
  sonner: { toast: { success() {}, error() {} } },
};

test("approved performers retain two visible disabled participation buttons and no dialog", () => {
  const { GigDetailActions } = loadSource("components/gigs/gig-detail-actions.tsx", uiMocks);
  for (const existingRsvp of [rsvp, null]) {
    const html = renderToStaticMarkup(React.createElement(GigDetailActions, { gig, existingRsvp, isLoggedIn: true, isCurrentUserPerformer: true }));
    assert.equal((html.match(/disabled=""/g) || []).length, 2);
    assert.equal((html.match(/<span>공연 참여<\/span>/g) || []).length, 2);
    assert.match(html, /text-emerald-300/);
    assert.doesNotMatch(html, /role="dialog"/);
  }
});

test("pending and ignored requests retain enabled participation buttons", () => {
  const { GigDetailActions } = loadSource("components/gigs/gig-detail-actions.tsx", uiMocks);
  for (const existingRsvp of [rsvp, null]) {
    const html = renderToStaticMarkup(React.createElement(GigDetailActions, { gig, existingRsvp, isLoggedIn: true, isCurrentUserPerformer: false }));
    assert.doesNotMatch(html, /disabled=""/);
    assert.match(html, existingRsvp ? /승인 대기 중/ : /공연 참여 등록/);
  }
});

test("new or ignored RSVP opens with no choice and saving disabled", () => {
  const { GigJoinDialog } = loadSource("components/gigs/gig-join-dialog.tsx", uiMocks);
  const html = renderToStaticMarkup(React.createElement(GigJoinDialog, { gig, isOpen: true, onClose() {}, existingRsvp: null }));
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 3);
  assert.match(html, /type="submit"[^>]*disabled=""/);
});

test("saved custom session is selected verbatim and direct-add control is available", () => {
  const { GigJoinDialog } = loadSource("components/gigs/gig-join-dialog.tsx", uiMocks);
  const html = renderToStaticMarkup(React.createElement(GigJoinDialog, { gig, isOpen: true, onClose() {}, existingRsvp: rsvp }));
  assert.match(html, /aria-pressed="true"[^>]*>어쿠스틱 기타<\/button>/);
  assert.match(html, /직접 추가할 세션/);
  assert.match(html, /승인 대기 중/);
});

test("admin table shows gig details on one row, omits undecided responses and pending chips", () => {
  const { GigRsvpManager } = loadSource("components/gigs/gig-rsvp-manager.tsx", uiMocks);
  const rsvps = [
    { ...rsvp, gigTitle: "가을 공연", note: "늦게 도착", user: { name: "참여자", generation: 39 } },
    { ...rsvp, id: 3, gig_id: 2, gigTitle: "겨울 공연", status: "not_going", user: { name: "불참자" } },
    { ...rsvp, id: 4, gigTitle: "미정 공연", status: "undecided", user: { name: "미정자" } },
  ];
  const html = renderToStaticMarkup(React.createElement(GigRsvpManager, { rsvps }));
  assert.match(html, /참여자 참여 신청 승인/);
  assert.match(html, /참여자 참여 신청 무시/);
  assert.doesNotMatch(html, /(?:불참자|미정자) 참여 신청 (?:승인|무시)/);
  assert.match(html, /text-emerald-600/);
  assert.match(html, /lucide-trash-2/);
  assert.doesNotMatch(html, /미정|승인 대기/);
  const headers = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(headers, ["공연제목", "이름", "기수", "신청세션", "비고", "승인", "무시"]);
  const rows = [...html.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/g)].map((match) => match[1]);
  assert.equal(rows.length, 3);
  assert.match(rows[1], /가을 공연.*참여자.*39기.*어쿠스틱 기타.*늦게 도착/);
  assert.match(rows[1], /href="\/gigs\/1"/);
  assert.match(rows[2], /href="\/gigs\/2"/);
});


test("RSVP schema failures report missing setup and never write", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  for (const code of ["42703", "PGRST204"]) {
    const fixture = actionsFixture({ gigError: { code } });
    const result = await fixture.actions.submitGigRsvp(form());
    assert.equal(result.ok, false);
    assert.match(result.error, /서버 설정이 누락/);
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.invalidations, []);
  }
  assert.equal(log.mock.callCount(), 2);
});

test("RSVP query failures block saving without misreporting schema setup", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const options of [{ gigError: { code: "42501" } }, { performerError: { code: "42501" } }]) {
    const fixture = actionsFixture(options);
    const result = await fixture.actions.submitGigRsvp(form());
    assert.equal(result.ok, false);
    assert.match(result.error, /공연 정보를 확인할 수 없습니다/);
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.invalidations, []);
  }
});
