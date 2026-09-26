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

test("nomination deadline is exactly 24 hours before the meeting and includes the boundary", () => {
  const { getNominationDeadline, isNominationClosed } = loadSource("lib/nomination-deadline.ts");
  const meeting = "2026-10-20T12:30:00+09:00";
  const deadline = Date.parse("2026-10-19T12:30:00+09:00");
  assert.equal(getNominationDeadline(meeting), deadline);
  assert.equal(getNominationDeadline("2026-10-20"), Date.parse("2026-10-19T00:00:00Z"));
  assert.equal(isNominationClosed(meeting, deadline - 1), false);
  assert.equal(isNominationClosed(meeting, deadline), true);
  assert.equal(isNominationClosed(meeting, deadline + 1), true);
});

test("missing and invalid meeting dates do not allow nominations", () => {
  const { getNominationDeadline, isNominationClosed } = loadSource("lib/nomination-deadline.ts");
  for (const meeting of [undefined, null, "", "invalid-date"]) {
    assert.equal(getNominationDeadline(meeting), null);
    assert.equal(isNominationClosed(meeting), true);
  }
});

const linkMock = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
const uiMocks = {
  "next/link": linkMock,
  "next/dynamic": { __esModule: true, default: () => () => null },
  "next/navigation": { useParams: () => ({ id: "1" }), useRouter: () => ({ push() {}, refresh() {} }) },
  "@/app/gigs/[id]/nominations/actions": { updateNominationViewAction() {} },
  sonner: { toast: { success() {}, error() {} } },
};

function renderPanel({ admin = false, meeting = closedMeeting } = {}) {
  const { NominationPanel } = loadSource("components/nominations/nomination-panel.tsx", uiMocks);
  return renderToStaticMarkup(React.createElement(NominationPanel, {
    initialIsAdmin: admin,
    initialSongs: [],
    initialUserId: "member-id",
    initialPerformer: { id: 3, part: "기타" },
    initialPerformers: [],
    initialGigInfo: { title: "테스트 공연", meetingDate: meeting },
    initialLastViewedTimestamp: null,
  }));
}

test("closed nominations expose disabled desktop, empty-state and mobile buttons without a navigable link", () => {
  for (const meeting of [closedMeeting, "", "invalid-date"]) {
    const html = renderPanel({ meeting });
    assert.doesNotMatch(html, /href="\/gigs\/1\/nominations\/new"/);
    const disabledButtons = [...html.matchAll(/<button\b(?=[^>]*\bdisabled="")[^>]*>(.*?)<\/button>/g)];
    assert.equal(disabledButtons.length, 3);
    assert.ok(disabledButtons.some(([button]) => button.includes("첫 번째 곡 추천하기")));
    assert.ok(disabledButtons.some(([button]) => button.includes("sm:hidden")));
    assert.doesNotMatch(html, /<a\b[^>]*>\s*<button\b/);
  }
});

test("members before the deadline and administrators after it retain all nomination links", () => {
  for (const options of [{ meeting: openMeeting }, { admin: true }]) {
    const html = renderPanel(options);
    assert.equal((html.match(/href="\/gigs\/1\/nominations\/new"/g) || []).length, 3);
    assert.doesNotMatch(html, /<a\b[^>]*>\s*<button\b/);
  }
});

function nominationFixture(options = {}) {
  const writes = [];
  const notifications = [];
  const invalidations = [];
  const gig = options.missingGig ? null : {
    id: 1,
    title: "테스트 공연",
    meeting_date: Object.hasOwn(options, "meeting") ? options.meeting : closedMeeting,
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
        single: async () => ({ data: { id: 7 }, error: null }),
        then(resolve, reject) { return Promise.resolve({ data: table === "performers" && performer ? [performer] : [], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  const mocks = {
    "next/cache": { revalidatePath: (value) => invalidations.push(value) },
    "@/lib/auth-admin": { getIsAdmin: async () => Boolean(options.admin) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/nomination-notifications": {
      enqueueSongNotification: async (...args) => { notifications.push(args); return 9; },
      processNotificationQueue: async () => ({ processedCount: 1 }),
      recordLastViewedNomination() {},
    },
    "next/navigation": { redirect: (destination) => { throw new Error(`REDIRECT:${destination}`); } },
    "next/link": linkMock,
    "@/components/site-layout": { SiteLayout: ({ children }) => children },
    "@/components/page-container": { PageContainer: ({ children }) => children },
    "@/components/nominations/nomination-form": { NominationForm: () => React.createElement("form", { "data-nomination-form": true }) },
  };
  return { mocks, writes, notifications, invalidations };
}

const payload = { title: "후보곡", artist: "아티스트", requiredParts: ["기타"], sheetExists: false, description: "", links: [], recommendedVocals: [] };

test("direct create-page access redirects ordinary members after closing", async () => {
  for (const meeting of [closedMeeting, null, "invalid-date"]) {
    const fixture = nominationFixture({ meeting });
    const { default: NewNominationPage } = loadSource("app/gigs/[id]/nominations/new/page.tsx", fixture.mocks);
    await assert.rejects(NewNominationPage({ params: Promise.resolve({ id: "1" }) }), /^Error: REDIRECT:\/gigs\/1\/nominations$/);
  }
});

test("create page allows members before closing and administrators after closing", async () => {
  for (const options of [{ meeting: openMeeting }, { admin: true, nonPerformer: true }]) {
    const fixture = nominationFixture(options);
    const { default: NewNominationPage } = loadSource("app/gigs/[id]/nominations/new/page.tsx", fixture.mocks);
    const html = renderToStaticMarkup(await NewNominationPage({ params: Promise.resolve({ id: "1" }) }));
    assert.match(html, /data-nomination-form="true"/);
  }
});

test("server actions reject late submissions and the legacy alias without writes or notifications", async () => {
  for (const meeting of [closedMeeting, null, "invalid-date"]) {
    const fixture = nominationFixture({ meeting });
    const actions = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
    for (const action of [actions.addNomination, actions.addSetlist]) {
      await assert.rejects(action("1", payload), /마감/);
    }
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.notifications, []);
    assert.deepEqual(fixture.invalidations, []);
  }
});

test("server action allows members before closing and administrators after closing", async () => {
  for (const options of [{ meeting: openMeeting }, { admin: true, nonPerformer: true }]) {
    const fixture = nominationFixture(options);
    const { addNomination } = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
    await addNomination("1", payload);
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.writes[0].table, "nominations");
    assert.equal(fixture.writes[0].payload.gig_id, 1);
    assert.equal(fixture.writes[0].payload.created_by, options.nonPerformer ? null : 3);
    assert.equal(fixture.notifications.length, 1);
    assert.ok(fixture.invalidations.includes("/gigs/1/nominations"));
  }
});

test("server action does not insert into a missing gig", async () => {
  const fixture = nominationFixture({ missingGig: true });
  const { addNomination } = loadSource("app/gigs/[id]/nominations/actions.ts", fixture.mocks);
  await assert.rejects(addNomination("1", payload));
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.notifications, []);
});
