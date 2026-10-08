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
const closedMeeting = "2000-01-02T12:00:00+09:00";
const openMeeting = "2099-01-02T12:00:00+09:00";

// Keep the real components and domain logic, isolating Next and Supabase boundaries.
function loadSource(relativePath, mocks = {}, cache = new Map()) {
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

test("configured deadline includes its exact closing boundary", () => {
  const { getNominationDeadline, isNominationClosed } = loadSource("lib/nomination-deadline.ts");
  const configured = "2026-10-19T12:30:00+09:00";
  const deadline = Date.parse(configured);
  assert.equal(getNominationDeadline(configured), deadline);
  assert.equal(isNominationClosed(configured, deadline - 1), false);
  assert.equal(isNominationClosed(configured, deadline), true);
  assert.equal(isNominationClosed(configured, deadline + 1), true);
});

test("no configured deadline keeps nominations open regardless of meeting date", () => {
  const { getNominationDeadline, isNominationClosed } = loadSource("lib/nomination-deadline.ts");
  for (const value of [undefined, null, ""]) {
    assert.equal(getNominationDeadline(value), null);
    assert.equal(isNominationClosed(value), false);
  }
  assert.equal(isNominationClosed(null, Date.parse(closedMeeting)), false);
  assert.equal(getNominationDeadline("invalid"), null);
  assert.equal(isNominationClosed("invalid"), true);
});

const linkMock = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
const uiMocks = {
  "next/link": linkMock,
  "next/dynamic": { __esModule: true, default: () => () => null },
  "next/navigation": { useParams: () => ({ id: "1" }), useRouter: () => ({ push() {}, refresh() {} }), useSearchParams: () => new URLSearchParams() },
  "@/app/gigs/[id]/nominations/actions": { updateNominationViewAction() {} },
  sonner: { toast: { success() {}, error() {} } },
};

function renderPanel({ admin = false, meeting = closedMeeting, deadline = null } = {}) {
  const { NominationPanel } = loadSource("components/nominations/nomination-panel.tsx", uiMocks);
  return renderToStaticMarkup(React.createElement(NominationPanel, {
    initialIsAdmin: admin,
    initialSongs: [],
    initialUserId: "member-id",
    initialPerformer: { id: 3, part: "기타" },
    initialPerformers: [],
    initialGigInfo: { title: "테스트 공연", meetingDate: meeting, nominationDeadline: deadline },
    initialLastViewedTimestamp: null,
  }));
}

test("song deep links open only a song loaded for the current gig", () => {
  const song = { id: 10, gigId: 1, title: "직접 연결 곡", artist: "", requiredParts: [], recommendedVocals: [], responses: [], links: [], createdAt: "2026-10-05", updatedAt: "2026-10-05", createdBy: null };
  for (const [query, opens] of [["song=10", true], ["song=99", false], ["song=invalid", false], ["", false]]) {
    const { NominationPanel } = loadSource("components/nominations/nomination-panel.tsx", {
      ...uiMocks,
      "next/navigation": { ...uiMocks["next/navigation"], useSearchParams: () => new URLSearchParams(query) },
      "next/dynamic": { __esModule: true, default: () => ({ song }) => song ? React.createElement("div", { "data-song-detail": song.id }, song.title) : null },
    });
    const html = renderToStaticMarkup(React.createElement(NominationPanel, {
      initialIsAdmin: true, initialSongs: [song], initialUserId: "admin", initialPerformer: null,
      initialPerformers: [], initialGigInfo: { title: "공연", meetingDate: "" }, initialLastViewedTimestamp: null,
    }));
    assert.equal(html.includes('data-song-detail="10"'), opens, query);
  }
});

test("deadline details appear only when an explicit deadline is set", () => {
  for (const meeting of [openMeeting, closedMeeting]) {
    assert.doesNotMatch(renderPanel({ meeting }), /lucide-alarm-clock/);
  }
  for (const deadline of [openMeeting, closedMeeting]) {
    const html = renderPanel({ meeting: openMeeting, deadline });
    assert.equal((html.match(/lucide-alarm-clock/g) || []).length, 2);
  }
});

test("closed nominations expose disabled desktop, empty-state and mobile buttons without a navigable link", () => {
  for (const options of [
    { meeting: closedMeeting, deadline: closedMeeting },
    { meeting: openMeeting, deadline: closedMeeting },
    { meeting: openMeeting, deadline: "invalid" },
  ]) {
    const html = renderPanel(options);
    assert.doesNotMatch(html, /href="\/gigs\/1\/nominations\/new"/);
    const disabledButtons = [...html.matchAll(/<button\b(?=[^>]*\bdisabled="")[^>]*>(.*?)<\/button>/g)];
    assert.equal(disabledButtons.length, 3);
    assert.ok(disabledButtons.some(([button]) => button.includes("첫 번째 곡 추천하기")));
    assert.ok(disabledButtons.some(([button]) => button.includes("sm:hidden")));
    assert.doesNotMatch(html, /<a\b[^>]*>\s*<button\b/);
  }
});

test("members before the deadline and administrators after it retain all nomination links", () => {
  for (const options of [{ meeting: closedMeeting }, { meeting: null }, { meeting: closedMeeting, deadline: openMeeting }, { admin: true, deadline: closedMeeting }]) {
    const html = renderPanel(options);
    assert.equal((html.match(/href="\/gigs\/1\/nominations\/new"/g) || []).length, 3);
    assert.doesNotMatch(html, /<a\b[^>]*>\s*<button\b/);
  }
});

function nominationFixture(options = {}) {
  const writes = [];
  const notifications = [];
  const invalidations = [];
  const afterCallbacks = [];
  const gig = options.missingGig ? null : {
    id: 1,
    title: "테스트 공연",
    meeting_date: Object.hasOwn(options, "meeting") ? options.meeting : closedMeeting,
    nomination_deadline: options.deadline ?? null,
  };
  const performer = options.nonPerformer ? null : { id: 3, part: "기타", name: "참여자" };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "member-id", user_metadata: {} } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({ data: table === "gigs" ? gig : table === "performers" ? performer : null, error: null }),
        insert(payload) { writes.push({ table, payload }); return query; },
        single: async () => ({ data: options.insertError ? null : { id: 7 }, error: options.insertError ?? null }),
        then(resolve, reject) { return Promise.resolve({ data: table === "performers" && performer ? [performer] : [], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  const mocks = {
    "next/cache": { revalidatePath: (value) => invalidations.push(value) },
    "next/server": { after(callback) {
      if (options.afterError) throw options.afterError;
      afterCallbacks.push(callback);
    } },
    "@/lib/auth-admin": { getIsAdmin: async () => Boolean(options.admin) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/nomination-views": { recordLastViewedNomination() {} },
    "@/lib/push-notifications": {
      processPendingPushNotifications: async (pushOptions) => {
        notifications.push(pushOptions);
        if (options.pushError) throw options.pushError;
        return options.pushResult ?? { processedCount: 1 };
      },
    },
    "next/navigation": { redirect: (destination) => { throw new Error(`REDIRECT:${destination}`); } },
    "next/link": linkMock,
    "@/components/site-layout": { SiteLayout: ({ children }) => children },
    "@/components/page-container": { PageContainer: ({ children }) => children },
    "@/components/nominations/nomination-form": { NominationForm: () => React.createElement("form", { "data-nomination-form": true }) },
  };
  return { mocks, writes, notifications, invalidations, afterCallbacks,
    runAfter: () => Promise.all(afterCallbacks.map((callback) => callback())),
  };
}

const payload = { title: "후보곡", artist: "아티스트", requiredParts: ["기타"], sheetExists: false, description: "", links: [], recommendedVocals: [] };

test("direct create-page access redirects ordinary members after closing", async () => {
  for (const options of [
    { meeting: closedMeeting, deadline: closedMeeting },
    { meeting: openMeeting, deadline: closedMeeting },
    { meeting: openMeeting, deadline: "invalid" },
  ]) {
    const fixture = nominationFixture(options);
    const { default: NewNominationPage } = loadSource("app/gigs/[id]/nominations/new/page.tsx", fixture.mocks);
    await assert.rejects(NewNominationPage({ params: Promise.resolve({ id: "1" }) }), /^Error: REDIRECT:\/gigs\/1\/nominations$/);
  }
});

test("create page allows members before closing and administrators after closing", async () => {
  for (const options of [{ meeting: closedMeeting }, { meeting: null }, { meeting: closedMeeting, deadline: openMeeting }, { admin: true, nonPerformer: true, deadline: closedMeeting }]) {
    const fixture = nominationFixture(options);
    const { default: NewNominationPage } = loadSource("app/gigs/[id]/nominations/new/page.tsx", fixture.mocks);
    const html = renderToStaticMarkup(await NewNominationPage({ params: Promise.resolve({ id: "1" }) }));
    assert.match(html, /data-nomination-form="true"/);
  }
});

test("server actions reject late submissions and the legacy alias without writes or notifications", async () => {
  for (const options of [
    { meeting: closedMeeting, deadline: closedMeeting },
    { meeting: openMeeting, deadline: closedMeeting },
    { meeting: openMeeting, deadline: "invalid" },
  ]) {
    const fixture = nominationFixture(options);
    const actions = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
    for (const action of [actions.addNomination, actions.addSetlist]) {
      await assert.rejects(action("1", payload), /마감/);
    }
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.afterCallbacks, []);
    assert.deepEqual(fixture.notifications, []);
    assert.deepEqual(fixture.invalidations, []);
  }
});

test("server action allows members before closing and administrators after closing", async () => {
  for (const options of [{ meeting: closedMeeting }, { meeting: null }, { meeting: closedMeeting, deadline: openMeeting }, { admin: true, nonPerformer: true, deadline: closedMeeting }]) {
    const fixture = nominationFixture(options);
    const { addNomination } = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
    await addNomination("1", payload);
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.writes[0].table, "nominations");
    assert.equal(fixture.writes[0].payload.gig_id, 1);
    assert.equal(fixture.writes[0].payload.created_by, options.nonPerformer ? null : 3);
    assert.deepEqual(fixture.notifications, []);
    assert.equal(fixture.afterCallbacks.length, 1);
    assert.ok(fixture.invalidations.includes("/gigs/1/nominations"));
    await fixture.runAfter();
    assert.deepEqual(fixture.notifications, [{ eventType: "nomination_added", eventKey: "nomination:7" }]);
  }
});

test("server action does not insert into a missing gig", async () => {
  const fixture = nominationFixture({ missingGig: true });
  const { addNomination } = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
  await assert.rejects(addNomination("1", payload));
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.afterCallbacks, []);
  assert.deepEqual(fixture.notifications, []);
});

test("slow FCM delivery cannot delay a saved nomination action", async () => {
  let finishPush;
  const pushResult = new Promise((resolve) => { finishPush = resolve; });
  const fixture = nominationFixture({ pushResult });
  const { addNomination } = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
  const outcome = await Promise.race([
    addNomination("1", payload).then(() => "saved"),
    new Promise((resolve) => setImmediate(() => resolve("blocked"))),
  ]);
  assert.equal(outcome, "saved");
  assert.deepEqual(fixture.notifications, []);
  const pending = fixture.runAfter();
  assert.equal(fixture.notifications.length, 1);
  assert.deepEqual(fixture.invalidations, ["/gigs/1/nominations", "/gigs/1"]);
  finishPush({ processedCount: 1 });
  await pending;
});

test("background delivery or scheduling failures preserve successful saves for outbox recovery", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    for (const options of [{ pushError: new Error("FCM unavailable") }, { afterError: new Error("worker unavailable") }]) {
      const fixture = nominationFixture(options);
      const { addNomination } = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
      await addNomination("1", payload);
      assert.equal(fixture.writes.length, 1);
      assert.equal(fixture.invalidations.length, 2);
      await fixture.runAfter();
      assert.equal(fixture.afterCallbacks.length, options.afterError ? 0 : 1);
    }
    assert.equal(warnings.length, 2);
  } finally { console.warn = originalWarn; }
});

test("failed nomination saves cannot schedule FCM delivery", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const fixture = nominationFixture({ insertError: { message: "DB error" } });
    const { addNomination } = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
    await assert.rejects(addNomination("1", payload), /DB error/);
    assert.deepEqual(fixture.afterCallbacks, []);
    assert.deepEqual(fixture.notifications, []);
    assert.deepEqual(fixture.invalidations, []);
  } finally { console.error = originalError; }
});
