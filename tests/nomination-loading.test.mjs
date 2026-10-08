import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { after, before, test } from "node:test";
import ts from "typescript";
import { parseNomination } from "../lib/nomination.ts";

const require = createRequire(import.meta.url);
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
before(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.example"; });
after(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
});

function load(file, mocks) {
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports,
  );
  return loaded.exports;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Each fixture is one server request, including metadata, header admin check and page.
function fixture({ userId = "member", admin = false, participant = true, gigExists = true, auth, gate, gigGate } = {}) {
  const calls = [];
  const user = userId ? { id: userId, user_metadata: { name: "멤버" } } : null;
  const client = {
    auth: { getUser() {
      calls.push({ table: "auth" });
      return auth?.promise ?? Promise.resolve({ data: { user }, error: null });
    } },
    from(table) {
      const filters = [];
      let selection;
      const execute = async () => {
        calls.push({ table, filters, selection });
        if (table === "gigs" && gigGate) await gigGate.promise;
        if (gate && (table === "admins" || (table === "performers" && filters.some(([key]) => key === "user_id")))) {
          await gate.promise;
        }
        let data = null;
        if (table === "gigs" && gigExists) data = { title: "공연", meeting_date: "2026-10-09", meeting_location: "회의실", nomination_deadline: null };
        if (table === "admins" && admin) data = { id: userId };
        if (table === "performers") {
          data = filters.some(([key]) => key === "user_id")
            ? participant ? { id: 3, name: "멤버", part: "기타" } : null
            : [{ id: 3, name: "멤버", part: "기타", user_id: participant ? userId : null, users: { name: "현재 이름", generation: 40 } }];
        }
        if (table === "users") data = { name: "멤버" };
        if (table === "setlist_views") data = { last_viewed_at: "2026-10-01" };
        if (table === "nominations") data = [{ id: 7, gig_id: 1, title: "후보곡", required_parts: ["기타"], created_at: "2026-10-05", responses: [{ id: 8, user_id: userId, session_part: "기타", status: "available", comment: "메모", updated_at: "2026-10-06", users: { name: "현재 이름", generation: 40, part: "기타" } }] }];
        return { data, error: null };
      };
      const query = {
        select(value) { selection = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; },
        maybeSingle: execute,
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
      return query;
    },
  };
  const react = { cache(fn) {
    const memo = new Map();
    return (...args) => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key);
    };
  } };
  const shared = { react, "@/lib/supabase/server": { createClient: async () => client } };
  const authData = load("lib/auth-server-data.ts", shared);
  const adminData = load("lib/auth-admin.ts", {
    ...shared, "@/lib/auth-server-data": authData, "@/lib/supabase/admin": { SUPABASE_ADMINS_TABLE: "admins" },
  });
  const gigData = load("lib/gig-server-data.ts", { ...shared, "@/lib/supabase/gigs": { SUPABASE_GIGS_TABLE: "gigs" } });
  const page = load("app/gigs/[id]/nominations/page.tsx", {
    ...shared, "@/lib/auth-server-data": authData, "@/lib/auth-admin": adminData, "@/lib/gig-server-data": gigData,
    "@/lib/nomination": { parseNomination },
    "@/components/nominations/nomination-panel": { NominationPanel: "panel" },
    "@/components/site-layout": { SiteLayout: "layout" },
    "@/components/page-container": { PageContainer: "container" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/loading-indicator": { LoadingIndicator: "loading" },
    "next/link": { default: "a" },
    "next/navigation": { redirect(href) { throw new Error(`redirect:${href}`); } },
  });
  const props = { params: Promise.resolve({ id: "1" }) };
  return { calls, user, ...authData, ...adminData,
    metadata: () => page.generateMetadata(props),
    content(id = "1") {
      const content = page.default({ params: Promise.resolve({ id }) }).props.children.props.children.props.children;
      return content.type(content.props);
    },
  };
}

test("metadata, header and nominations share one verified user and one gig lookup per request", async () => {
  const f = fixture();
  const [metadata, tree, admin] = await Promise.all([f.metadata(), f.content(), f.getIsAdmin()]);
  assert.match(metadata.title, /^공연 선곡회의/);
  assert.equal(tree.type, "panel");
  assert.equal(admin, false);
  assert.equal(tree.props.initialUserId, "member");
  assert.equal(tree.props.initialSongs[0].responses[0].comment, "메모");
  assert.equal(tree.props.initialPerformers[0].name, "현재 이름");
  assert.equal(tree.props.initialLastViewedTimestamp, "2026-10-01");
  for (const table of ["auth", "gigs", "admins"]) assert.equal(f.calls.filter((call) => call.table === table).length, 1, table);
  const nextRequest = fixture({ userId: "other", admin: true });
  assert.equal((await nextRequest.content()).props.initialUserId, "other");
  assert.equal(nextRequest.calls.filter((call) => call.table === "auth").length, 1);
});

test("gig lookup overlaps authentication and protected datasets wait for both authorization checks", async () => {
  const auth = deferred();
  const gate = deferred();
  const f = fixture({ auth, gate });
  const pending = f.content();
  await new Promise(setImmediate);
  assert.ok(f.calls.some((call) => call.table === "gigs"));
  assert.ok(!f.calls.some((call) => call.table === "admins" || call.table === "performers"));
  auth.resolve({ data: { user: f.user }, error: null });
  await new Promise(setImmediate);
  assert.ok(f.calls.some((call) => call.table === "admins"));
  assert.ok(f.calls.some((call) => call.table === "performers"));
  assert.ok(!f.calls.some((call) => call.table === "nominations" || call.table === "setlist_views"));
  gate.resolve();
  assert.equal((await pending).type, "panel");
});

test("unauthorized and invalid requests never load songs, roster or view history", async () => {
  for (const options of [{ participant: false }, { userId: null }, { gigExists: false }]) {
    const f = fixture(options);
    if (options.participant === false) assert.notEqual((await f.content()).type, "panel");
    else await assert.rejects(f.content(), /redirect:/);
    assert.ok(!f.calls.some((call) => call.table === "nominations" || call.table === "setlist_views"));
    assert.ok(!f.calls.some((call) => call.table === "performers" && !call.filters.some(([key]) => key === "user_id")));
  }
  const f = fixture();
  await assert.rejects(f.content("invalid"), /redirect:\/gigs/);
  assert.equal(f.calls.length, 0);
});

test("administrators retain unlinked-performer name fallback and participant-independent access", async () => {
  const f = fixture({ admin: true, participant: false });
  const tree = await f.content();
  assert.equal(tree.type, "panel");
  assert.equal(tree.props.initialIsAdmin, true);
  assert.deepEqual(tree.props.initialPerformer, { id: 3, name: "멤버", part: "기타" });
  assert.ok(f.calls.some((call) => call.table === "users"));
});

test("logged-out requests redirect without waiting for a slow gig lookup", async () => {
  const gigGate = deferred();
  const f = fixture({ userId: null, gigGate });
  try {
    const outcome = await Promise.race([
      f.content().then(() => "rendered", (error) => error.message),
      new Promise((resolve) => setImmediate(() => resolve("still waiting"))),
    ]);
    assert.equal(outcome, "redirect:/auth/login?redirect=/gigs/1/nominations");
    assert.ok(!f.calls.some((call) => call.table === "performers" || call.table === "nominations"));
  } finally { gigGate.resolve(); }
});
