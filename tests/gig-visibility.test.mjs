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

// Exercise the real page components while isolating authentication and DB access.
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

const publicGig = { id: 1, title: "전체 공개 공연", visibility: "public", is_public: true, perform_date: "2099-01-02", location: "공개 공연장" };
const membersGig = { id: 2, title: "회원 전용 공연", visibility: "members", is_public: false, perform_date: "2099-01-03", location: "회원 공연장" };
const privateGig = { id: 3, title: "관리자 전용 공연", visibility: "private", is_public: false, perform_date: "2099-01-04", location: "관리자 공연장" };
const legacyMembersGig = { id: 4, title: "기존 회원 공연", is_public: false, perform_date: "2099-01-05", location: "기존 회원 공연장" };
const legacyPublicGig = { id: 5, title: "기존 공개 공연", is_public: true, perform_date: "2099-01-06", location: "기존 공개 공연장" };
const allGigs = [publicGig, membersGig, privateGig, legacyMembersGig, legacyPublicGig];
const viewerCases = [
  { name: "guests", options: { signedOut: true }, visibleIds: [1, 5] },
  { name: "ordinary members", options: {}, visibleIds: [1, 2, 4, 5] },
  { name: "performers", options: { performer: true }, visibleIds: [1, 2, 4, 5] },
  { name: "administrators", options: { admin: true }, visibleIds: [1, 2, 3, 4, 5] },
];

function visibilityFixture({ signedOut = false, admin = false, performer = false, gig = membersGig } = {}) {
  const queries = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: signedOut ? null : { id: "ordinary-member" } }, error: null }) },
    from(table) {
      const entry = { table, fields: null };
      queries.push(entry);
      const query = {
        select(fields) { entry.fields = fields; return query; },
        eq() { return query; },
        order() { return query; },
        limit() { return query; },
        maybeSingle: async () => ({
          data: table === "users" ? { name: "일반 회원", part: "기타" }
            : table === "performers" && performer ? { id: 4 } : null,
          error: null,
        }),
        then(resolve, reject) {
          const data = table === "gigs" ? allGigs
            : table === "setlists" ? [{ id: 3, title: "공연 수록곡", artist: "공연 아티스트", session_members: null, order_num: 1 }]
              : table === "performers" ? [{ id: 4, part: "기타", user_id: "other-member", name: "출연 회원", photo_url: null, users: null }]
                : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const mocks = {
    "@/lib/auth-admin": { getIsAdmin: async () => admin },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/gig-server-data": { getGigRow: async () => ({ data: gig, error: null }) },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/site-layout": { SiteLayout: ({ children }) => children },
    "@/components/page-container": { PageContainer: ({ children }) => children },
    "@/components/gigs/share-gig-button": { ShareGigButton: () => null },
    "@/components/gigs/performer-card-grid": {
      PerformerCardGrid: ({ performers }) => React.createElement("div", null, performers.map((performer) => performer.name).join(", ")),
    },
    "@/components/gigs/gig-detail-actions": { GigDetailActions: () => React.createElement("div", { "data-member-actions": true }) },
  };
  return { mocks, queries };
}

test("visibility preserves legacy audiences and explicit settings take precedence", () => {
  const { getGigVisibility, canViewGig } = loadSource("lib/gig-visibility.ts", {});
  assert.equal(getGigVisibility({ is_public: false }), "members");
  assert.equal(getGigVisibility({ is_public: true }), "public");
  assert.equal(getGigVisibility({}), "members");
  assert.equal(getGigVisibility({ visibility: "private", is_public: true }), "private");
  assert.equal(getGigVisibility({ visibility: "public", is_public: false }), "public");
  assert.equal(getGigVisibility({ visibility: "unknown", is_public: true }), "private");
  assert.equal(canViewGig("private", { isLoggedIn: true, isAdmin: false, isPerformer: true }), false);
  assert.equal(canViewGig("private", { isLoggedIn: false, isAdmin: true }), false);
});

for (const viewer of viewerCases) {
  test(`${viewer.name} see only permitted gigs in the list with correct visibility badges`, async () => {
    const fixture = visibilityFixture(viewer.options);
    const { GigsInner } = loadSource("app/gigs/gigs-inner.tsx", fixture.mocks);
    const html = renderToStaticMarkup(await GigsInner());
    for (const gig of allGigs) {
      const allowed = viewer.visibleIds.includes(gig.id);
      assert.equal(html.includes(gig.title), allowed, `${viewer.name}: ${gig.title}`);
      assert.equal(html.includes(`href="/gigs/${gig.id}"`), allowed);
    }
    assert.equal(html.includes("회원 공개</div>"), !viewer.options.signedOut);
    assert.equal(html.includes("비공개</div>"), Boolean(viewer.options.admin));
    assert.equal(html.includes('href="/gigs/new"'), Boolean(viewer.options.admin));
  });

  test(`${viewer.name} can read only permitted gig details, including legacy gigs`, async () => {
    for (const gig of allGigs) {
      const fixture = visibilityFixture({ ...viewer.options, gig });
      const { GigDetailInner } = loadSource("app/gigs/[id]/gig-detail-inner.tsx", fixture.mocks);
      const html = renderToStaticMarkup(await GigDetailInner({ gigId: String(gig.id) }));
      const allowed = viewer.visibleIds.includes(gig.id);
      assert.equal(html.includes(gig.title), allowed, `${viewer.name}: ${gig.title}`);
      assert.equal(html.includes(gig.location), allowed);
      assert.equal(html.includes("공연 수록곡"), allowed);
      assert.equal(html.includes("출연 회원"), allowed);
      assert.equal(html.includes(`href="/gigs/${gig.id}/edit"`), allowed && Boolean(viewer.options.admin));
      if (allowed) {
        assert.doesNotMatch(html, /공연입니다/);
        assert.equal(html.includes("회원 공개</div>"), [2, 4].includes(gig.id));
        assert.equal(html.includes("비공개</div>"), gig.id === 3);
      } else {
        assert.match(html, gig.id === 3 ? /비공개 공연입니다/ : /회원 공개 공연입니다/);
        assert.doesNotMatch(html, /data-member-actions/);
        assert.deepEqual(fixture.queries, []);
        assert.equal(html.includes(`href="/auth/login?redirect=/gigs/${gig.id}"`), Boolean(viewer.options.signedOut));
      }
    }
  });

  test(`${viewer.name} receive titles in metadata only for permitted gigs`, async () => {
    for (const gig of allGigs) {
      const fixture = visibilityFixture({ ...viewer.options, gig });
      const { generateMetadata } = loadSource("app/gigs/[id]/page.tsx", fixture.mocks);
      const metadata = await generateMetadata({ params: Promise.resolve({ id: String(gig.id) }) });
      if (viewer.visibleIds.includes(gig.id)) {
        assert.equal(metadata.title, `${gig.title} | 공연 정보`);
      } else {
        assert.equal(metadata.title, `${gig.id === 3 ? "비공개 공연" : "회원 공개 공연"} | 공연 정보`);
        assert.equal(JSON.stringify(metadata).includes(gig.title), false);
        assert.equal(JSON.stringify(metadata).includes(gig.location), false);
      }
    }
  });
}
