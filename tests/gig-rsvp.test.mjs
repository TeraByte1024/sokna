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
    auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: "member-id" } }, error: options.authError ?? null }) },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, limit() { return query; },
        maybeSingle: async () => ({
          data: table === "gigs"
            ? options.gig ?? { visibility: options.privateGig ? "private" : "public", is_public: !options.privateGig }
            : table === "users" ? (options.missingProfile ? null : { status: options.memberStatus ?? "approved", part: null })
              : options.performer ?? null,
          error: table === "gigs" ? options.gigError ?? null : table === "users" ? options.profileError ?? null : options.performerError ?? null,
        }),
        upsert: (payload) => {
          writes.push({ table, payload });
          return { select: () => ({ single: async () => ({
            data: { id: 42, updated_at: payload.updated_at }, error: null,
          }) }) };
        },
      };
      return query;
    },
    rpc: async (name, payload) => { writes.push({ name, payload }); return { data: options.reviewed ?? true, error: options.rpcError ?? null }; },
  };
  const actions = loadSource("app/gigs/actions.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (value) => invalidations.push(value) },
    "@/lib/auth-admin": { getIsAdmin: async () => Boolean(options.admin) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/push-notifications": { processPendingPushNotifications: async () => ({ processedCount: 0, sentCount: 0 }) },
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

test("multiple RSVP sessions are trimmed, deduplicated, and stored for approval", async () => {
  const fixture = actionsFixture();
  const data = form("going", "  기타  ");
  data.append("part", "드럼");
  data.append("part", "드럼");
  data.append("part", "베이스");
  assert.deepEqual(await fixture.actions.submitGigRsvp(data), { ok: true });
  assert.equal(fixture.writes[0].payload.part, "기타, 드럼, 베이스");

  for (const invalidPart of ["   ", "기타, 드럼"]) {
    const invalid = actionsFixture();
    assert.equal((await invalid.actions.submitGigRsvp(form("going", invalidPart))).ok, false);
    assert.equal(invalid.writes.length, 0);
  }
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
  assert.doesNotMatch(html, /관리자 승인 후 공연 참여자로 등록됩니다/);
});

test("saved custom session is selected verbatim and direct-add control is available", () => {
  const { GigJoinDialog } = loadSource("components/gigs/gig-join-dialog.tsx", uiMocks);
  const html = renderToStaticMarkup(React.createElement(GigJoinDialog, { gig, isOpen: true, onClose() {}, existingRsvp: rsvp }));
  assert.match(html, /aria-pressed="true"[^>]*>어쿠스틱 기타<\/button>/);
  assert.match(html, /aria-label="세션 직접 입력"/);
  assert.match(html, /border-dashed/);
  assert.doesNotMatch(html, /aria-label="직접 추가할 세션"/);
  assert.match(html, /승인 대기 중/);
  assert.match(html, /관리자 승인 후 공연 참여자로 등록됩니다/);

  const notGoing = renderToStaticMarkup(React.createElement(GigJoinDialog, {
    gig, isOpen: true, onClose() {}, existingRsvp: { ...rsvp, status: "not_going", part: null },
  }));
  assert.doesNotMatch(notGoing, /관리자 승인 후 공연 참여자로 등록됩니다/);
});

test("saved sessions can be toggled independently and submitted together", async () => {
  const state = [];
  const submissions = [];
  let stateIndex = 0;
  let tree;
  const noop = () => {};
  const mocks = {
    ...uiMocks,
    react: {
      useEffect: noop,
      useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
      },
    },
    "@/app/gigs/actions": { submitGigRsvp: async (data) => { submissions.push(data); return { ok: true }; } },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "@/lib/utils": { formatKoreanDateTime: () => "" },
  };
  const { GigJoinDialog } = loadSource("components/gigs/gig-join-dialog.tsx", mocks);
  const find = (node, predicate) => {
    if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
    if (!node || typeof node !== "object") return [];
    return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
  };
  const render = () => {
    stateIndex = 0;
    tree = GigJoinDialog({ gig, isOpen: true, onClose: noop, existingRsvp: { ...rsvp, part: "기타, 드럼" } });
  };
  const chips = () => find(tree, (node) => node.type === "button" && "aria-pressed" in node.props);
  const chip = (name) => chips().find((node) => node.props.children === name);
  render();
  assert.equal(chip("기타").props["aria-pressed"], true);
  assert.equal(chip("드럼").props["aria-pressed"], true);
  chip("드럼").props.onClick();
  render();
  assert.equal(chip("드럼").props["aria-pressed"], false);
  chip("기타").props.onClick();
  render();
  assert.equal(find(tree, (node) => node.props?.type === "submit")[0].props.disabled, true);
  chip("기타").props.onClick();
  render();
  chip("베이스").props.onClick();
  render();
  assert.equal(chip("기타").props["aria-pressed"], true);
  assert.equal(chip("베이스").props["aria-pressed"], true);
  const input = () => find(tree, (node) => node.type === "input"
    && node.props["aria-label"] === "직접 추가할 세션")[0];
  const openInput = () => {
    find(tree, (node) => node.type === "button"
      && node.props["aria-label"] === "세션 직접 입력")[0].props.onClick();
    render();
    assert.ok(input());
    assert.equal(input().props.autoFocus, true);
  };
  const typeSession = (value) => {
    input().props.onChange({ target: { value } });
    render();
  };
  openInput();
  input().props.onBlur();
  render();
  assert.equal(input(), undefined);
  openInput();
  typeSession("바이올린, 비올라");
  input().props.onBlur();
  render();
  assert.equal(chip("바이올린"), undefined);
  openInput();
  typeSession("바이올린");
  const enterInput = input();
  enterInput.props.onKeyDown({
    key: "Enter", nativeEvent: { isComposing: false }, preventDefault: noop,
    currentTarget: { blur: () => enterInput.props.onBlur() },
  });
  render();
  assert.equal(input(), undefined);
  assert.equal(submissions.length, 0);
  openInput();
  typeSession("비올라");
  input().props.onBlur();
  render();
  openInput();
  typeSession("기타");
  input().props.onBlur();
  render();
  assert.equal(chip("바이올린").props["aria-pressed"], true);
  assert.equal(chip("비올라").props["aria-pressed"], true);
  await find(tree, (node) => node.type === "form")[0].props.onSubmit({ preventDefault: noop });
  assert.deepEqual(submissions[0].getAll("part"), ["기타", "베이스", "바이올린", "비올라"]);
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


test("unapproved accounts cannot submit RSVP even to a public gig", async () => {
  for (const options of [
    { memberStatus: "pending" }, { memberStatus: "rejected" }, { missingProfile: true },
    { profileError: { code: "DB_UNAVAILABLE" } }, { authError: { message: "Session unavailable" } },
  ]) {
    for (const visibility of ["public", "members"]) {
      const fixture = actionsFixture({ ...options, gig: { visibility } });
      const result = await fixture.actions.submitGigRsvp(form());
      assert.equal(result.ok, false);
      assert.deepEqual(fixture.writes, []);
      assert.deepEqual(fixture.invalidations, []);
    }
  }
});

test("administrators retain RSVP access independently of membership status", async () => {
  const fixture = actionsFixture({ admin: true, memberStatus: "pending", privateGig: true });
  assert.deepEqual(await fixture.actions.submitGigRsvp(form()), { ok: true });
  assert.equal(fixture.writes.length, 1);
});
