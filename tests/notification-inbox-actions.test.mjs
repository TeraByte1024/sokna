import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const item = (index, changes = {}) => ({ id: id(index), user_id: "member-a", title: "새 알림", body: "내용", link: "/members", created_at: "2026-09-26T12:00:00.000Z", read_at: null, push_status: "sent", ...changes });

function fixture(seed = [], { userId = "member-a", authError = false } = {}) {
  const rows = structuredClone(seed);
  const writes = [];
  const queries = [];
  const failures = { read: false, count: false, write: false };
  let currentTime = Date.parse("2026-09-27T12:00:00.000Z");
  class ClockDate extends Date {
    constructor(value) { super(value === undefined ? currentTime : value); }
    static now() { return currentTime; }
  }
  const makeClient = (service) => ({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: authError ? new Error("auth offline") : null }) },
    from(table) {
      assert.equal(table, "notifications");
      const filters = [];
      const sort = [];
      let fields = "*", options = {}, limit = Infinity, update, cursorFilter;
      const query = { service, filters, sort, cursor: null };
      queries.push(query);
      function result(single = false) {
        let matched = rows.filter((row) => filters.every(([operator, key, value]) => operator === "lte" ? Date.parse(row[key]) <= Date.parse(value) : row[key] === value));
        if (cursorFilter) matched = matched.filter(cursorFilter);
        if (update) {
          assert.equal(service, true, "Only authenticated server writes may mark reads");
          if (failures.write) return { data: null, error: new Error("write failed") };
          writes.push({ patch: structuredClone(update), ids: matched.map((row) => row.id), filters: [...filters] });
          matched.forEach((row) => Object.assign(row, update));
        } else if (options.head ? failures.count : failures.read) return { data: null, count: null, error: new Error("read failed") };
        const count = matched.length;
        matched = [...matched].sort((left, right) => {
          for (const [key, ascending] of sort) {
            if (left[key] !== right[key]) return (left[key] < right[key] ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        }).slice(0, limit);
        const projected = matched.map((row) => fields === "*" ? { ...row } : Object.fromEntries(fields.split(",").map((key) => [key.trim(), row[key.trim()]])));
        return { data: options.head ? null : single ? projected[0] ?? null : projected, count: options.count ? count : null, error: null };
      }
      const builder = {
        select(value, nextOptions = {}) { fields = value; options = nextOptions; return builder; },
        eq(key, value) { filters.push(["eq", key, value]); return builder; },
        is(key, value) { filters.push(["is", key, value]); return builder; },
        lte(key, value) { filters.push(["lte", key, value]); return builder; },
        or(value) {
          query.cursor = value;
          const match = /^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([a-f0-9-]+)\)$/.exec(value);
          assert.ok(match, "Cursor must preserve the validated timestamp and UUID");
          cursorFilter = (row) => row.created_at < match[1] || (row.created_at === match[2] && row.id < match[3]);
          return builder;
        },
        order(key, value) { sort.push([key, value.ascending]); return builder; },
        limit(value) { limit = value; return builder; },
        update(value) { update = value; return builder; },
        maybeSingle: async () => result(true),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
  });
  const mocks = {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => makeClient(false) },
    "@/lib/supabase/service": { createServiceClient: () => makeClient(true) },
  };
  function load(relative) {
    const filename = path.join(root, relative);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = { exports: {} };
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date: ClockDate, URL, Error }, { filename })((name) => {
      assert.ok(Object.hasOwn(mocks, name), `Missing boundary: ${name}`);
      return mocks[name];
    }, loaded, loaded.exports);
    return loaded.exports;
  }
  const helpers = load("lib/notifications.ts");
  mocks["@/lib/notifications"] = helpers;
  const actions = load("app/notifications/actions.ts");
  return { actions, helpers, rows, writes, queries, failures, advance: (milliseconds) => { currentTime += milliseconds; } };
}

test("inbox pages include only the current user's 20 newest items while unread count covers the entire inbox", async () => {
  const seed = Array.from({ length: 25 }, (_, index) => item(index + 1));
  seed.push(item(26, { created_at: "2026-09-28T00:00:00.000Z" }), item(100, { user_id: "member-b" }));
  const f = fixture(seed);
  const first = await f.actions.listNotificationsAction({ expectedUserId: "member-a" });
  assert.equal(first.ok, true);
  assert.equal(first.items.length, 20);
  assert.equal(first.unreadCount, 26);
  assert.equal(first.items[0].id, id(25));
  assert.equal(first.items[19].id, id(6));
  const second = await f.actions.listNotificationsAction({ cursor: first.nextCursor, cutoff: first.cutoff, expectedUserId: "member-a" });
  assert.equal(second.ok, true);
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  assert.equal(second.cutoff, first.cutoff);
  assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 25);
});

test("single read updates only read_at, preserves first-read time, and returns the full remaining count", async () => {
  const f = fixture([item(1), item(2), item(3, { user_id: "member-b" })]);
  const first = await f.actions.markNotificationReadAction(id(1), "member-a");
  assert.equal(first.ok, true);
  assert.equal(first.unreadCount, 1);
  assert.deepEqual(Object.keys(f.writes[0].patch), ["read_at"]);
  assert.equal(f.rows[0].title, "새 알림");
  assert.equal(f.rows[0].push_status, "sent");
  f.advance(5_000);
  const again = await f.actions.markNotificationReadAction(id(1), "member-a");
  assert.equal(again.readAt, first.readAt);
  assert.equal(f.writes.length, 1);
  assert.equal(f.rows[2].read_at, null);
});

test("mark-all uses the visible snapshot cutoff and preserves newer and other-user notifications", async () => {
  const f = fixture([item(1), item(2, { user_id: "member-b" })]);
  const page = await f.actions.listNotificationsAction({ expectedUserId: "member-a" });
  f.advance(10_000);
  f.rows.push(item(3, { created_at: "2026-09-27T12:00:05.000Z" }));
  const result = await f.actions.markAllNotificationsReadAction(page.cutoff, "member-a");
  assert.equal(result.ok, true);
  assert.equal(result.unreadCount, 1);
  assert.ok(f.rows[0].read_at);
  assert.equal(f.rows[1].read_at, null);
  assert.equal(f.rows[2].read_at, null);
  assert.deepEqual(f.writes[0].ids, [id(1)]);
});

test("a different recipient or changed login cannot be marked read through the actions", async () => {
  const f = fixture([item(1, { user_id: "member-b" })]);
  assert.equal((await f.actions.markNotificationReadAction(id(1), "member-a")).ok, false);
  assert.equal((await f.actions.markNotificationReadAction(id(1), "member-b")).ok, false);
  assert.equal((await f.actions.markAllNotificationsReadAction("2026-09-27T12:00:00.000Z", "member-b")).ok, false);
  assert.equal((await f.actions.listNotificationsAction({ expectedUserId: "member-b" })).ok, false);
  assert.equal(f.writes.length, 0);
  assert.ok(f.queries.every((query) => !query.service));
});

test("unauthenticated and failed-auth requests never query or write notification data", async () => {
  for (const auth of [{ userId: null }, { authError: true }]) {
    const f = fixture([item(1)], auth);
    assert.equal((await f.actions.listNotificationsAction()).ok, false);
    assert.equal((await f.actions.markNotificationReadAction(id(1), "member-a")).ok, false);
    assert.equal(await f.helpers.getUnreadNotificationCount("member-a"), null);
    assert.equal(f.queries.length, 0);
    assert.equal(f.writes.length, 0);
  }
});

test("invalid cursors, IDs and future cutoffs are rejected before notification queries", async () => {
  const f = fixture([item(1)]);
  assert.equal((await f.actions.listNotificationsAction({ cursor: { created_at: "2026-09-27T00:00:00Z),user_id.eq.other", id: id(1) } })).ok, false);
  assert.equal((await f.actions.listNotificationsAction({ cutoff: "2027-01-01T00:00:00Z" })).ok, false);
  assert.equal((await f.actions.markNotificationReadAction("not-a-uuid", "member-a")).ok, false);
  assert.equal((await f.actions.markAllNotificationsReadAction("2027-01-01T00:00:00Z", "member-a")).ok, false);
  assert.equal(f.queries.length, 0);
});

test("cursor filtering retains database timestamp microseconds", async () => {
  const f = fixture([item(1, { created_at: "2026-09-26T12:00:00.123455+00:00" })]);
  const result = await f.actions.listNotificationsAction({ cursor: { created_at: "2026-09-26T12:00:00.123456+00:00", id: id(2) } });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.match(f.queries.find((query) => query.cursor).cursor, /123456\+00:00/);
});

test("read and write errors are distinguishable from an empty inbox or successful read", async () => {
  const empty = fixture();
  assert.equal(await empty.helpers.getUnreadNotificationCount("member-a"), 0);
  const f = fixture([item(1)]);
  f.failures.read = true;
  assert.equal((await f.actions.listNotificationsAction()).ok, false);
  f.failures.read = false;
  f.failures.count = true;
  assert.equal(await f.helpers.getUnreadNotificationCount("member-a"), null);
  assert.equal((await f.actions.listNotificationsAction()).ok, false);
  f.failures.count = false;
  f.failures.write = true;
  assert.equal((await f.actions.markNotificationReadAction(id(1), "member-a")).ok, false);
  assert.equal(f.rows[0].read_at, null);
});

test("notification links only navigate within the app", async () => {
  const f = fixture([item(1, { link: "javascript:alert(1)" })]);
  assert.equal((await f.actions.listNotificationsAction()).items[0].link, "/");
  for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "/\n/evil.example"]) assert.equal(f.helpers.notificationLink(unsafe), "/");
  assert.equal(f.helpers.notificationLink("/gigs/7/nominations?new=1#song"), "/gigs/7/nominations?new=1#song");
  assert.equal(f.helpers.notificationLink(null), null);
});
