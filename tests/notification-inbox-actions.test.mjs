import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const item = (index, changes = {}) => ({ id: id(index), user_id: "member-a", title: "새 알림", body: "내용", link: "/members", created_at: "2026-09-26T12:00:00.000Z", read_at: null, push_status: "accepted", ...changes });


// Match PostgreSQL timestamptz comparison rather than truncating at milliseconds.
function timestampMicros(value) {
  const milliseconds = Date.parse(value);
  assert.ok(Number.isFinite(milliseconds), "Fixture timestamps must be valid");
  const fraction = value.match(/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
  return BigInt(milliseconds) * 1_000n + BigInt(fraction.padEnd(6, "0").slice(3));
}

function fixture(seed = [], { userId = "member-a", authError = false } = {}) {
  const rows = structuredClone(seed);
  const writes = [];
  const queries = [];
  const failures = { read: false, count: false, write: false, service: false };
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
      let fields = "*", options = {}, limit = Infinity, update, deleting = false, cursorFilter;
      const query = { service, filters, sort, cursor: null };
      queries.push(query);
      function result(single = false) {
        let matched = rows.filter((row) => filters.every(([operator, key, value]) => operator === "lte" ? timestampMicros(row[key]) <= timestampMicros(value) : row[key] === value));
        if (cursorFilter) matched = matched.filter(cursorFilter);
        if (update || deleting) {
          assert.equal(service, true, "Only authenticated server actions may modify notifications");
          if (failures.write) return { data: null, error: new Error("write failed") };
          writes.push({ operation: deleting ? "delete" : "update", patch: structuredClone(update), ids: matched.map((row) => row.id), filters: [...filters] });
          if (deleting) {
            const removed = new Set(matched);
            for (let index = rows.length - 1; index >= 0; index--) if (removed.has(rows[index])) rows.splice(index, 1);
          } else matched.forEach((row) => Object.assign(row, update));
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
        delete() { deleting = true; return builder; },
        maybeSingle: async () => result(true),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
  });
  const mocks = {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => makeClient(false) },
    "@/lib/supabase/service": { createServiceClient: () => { if (failures.service) throw new Error("PRIVATE_SERVICE_FAILURE"); return makeClient(true); } },
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
  assert.equal(f.rows[0].push_status, "accepted");
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

for (const readAt of [null, "2026-09-27T00:00:00.000Z"]) {
  test(`deleting an own ${readAt ? "read" : "unread"} notification preserves other rows and returns the whole unread count`, async () => {
    const f = fixture([item(1, { read_at: readAt }), item(2), item(3, { user_id: "member-b" })]);
    const result = await f.actions.deleteNotificationAction(id(1), "member-a");
    assert.equal(result.ok, true);
    assert.equal(result.userId, "member-a");
    assert.equal(result.unreadCount, 1);
    assert.deepEqual(f.rows.map((row) => row.id), [id(2), id(3)]);
    assert.equal(f.rows[0].read_at, null);
    assert.equal(f.rows[1].read_at, null);
    assert.equal(f.writes[0].operation, "delete");
    assert.deepEqual(f.writes[0].filters, [["eq", "id", id(1)], ["eq", "user_id", "member-a"]]);
    assert.deepEqual(f.writes[0].ids, [id(1)]);
  });
}

test("deleting another account's ID or a missing ID has the same result and preserves that account's row", async () => {
  const f = fixture([item(1), item(2, { user_id: "member-b" })]);
  const foreign = await f.actions.deleteNotificationAction(id(2), "member-a");
  const missing = await f.actions.deleteNotificationAction(id(999), "member-a");
  assert.equal(foreign.ok, true);
  assert.equal(foreign.userId, "member-a");
  assert.equal(foreign.unreadCount, 1);
  assert.deepEqual(foreign, missing);
  assert.deepEqual(f.rows.map((row) => row.id), [id(1), id(2)]);
  assert.ok(f.writes.every((write) => write.operation === "delete" && write.ids.length === 0));
});

test("deletion is idempotent and repeating it does not change the remaining unread count", async () => {
  const f = fixture([item(1), item(2)]);
  const first = await f.actions.deleteNotificationAction(id(1), "member-a");
  const again = await f.actions.deleteNotificationAction(id(1), "member-a");
  assert.equal(first.ok, true);
  assert.deepEqual(first, again);
  assert.equal(again.unreadCount, 1);
  assert.deepEqual(f.rows.map((row) => row.id), [id(2)]);
});

test("invalid deletion inputs, unauthenticated sessions, and changed accounts never issue a privileged write", async () => {
  for (const input of [["not-a-uuid", "member-a"], [id(1), ""], [id(1), null], [id(1), undefined]]) {
    const f = fixture([item(1)]);
    assert.equal((await f.actions.deleteNotificationAction(...input)).ok, false);
    assert.equal(f.queries.length, 0);
  }
  for (const auth of [{ userId: null }, { authError: true }, { userId: "member-b" }]) {
    const f = fixture([item(1)], auth);
    assert.equal((await f.actions.deleteNotificationAction(id(1), "member-a")).ok, false);
    assert.equal(f.queries.length, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.rows.length, 1);
  }
});

test("failed deletion leaves the notification intact and can be retried without leaking database details", async () => {
  const f = fixture([item(1), item(2)]);
  f.failures.write = true;
  const failed = await f.actions.deleteNotificationAction(id(1), "member-a");
  assert.equal(failed.ok, false);
  assert.doesNotMatch(failed.error, /write failed/);
  assert.equal(f.rows.length, 2);
  assert.equal(f.writes.length, 0);
  f.failures.write = false;
  assert.equal((await f.actions.deleteNotificationAction(id(1), "member-a")).ok, true);
  assert.deepEqual(f.rows.map((row) => row.id), [id(2)]);
});

test("a failed count after deletion reports an error and a later retry returns the correct current count", async () => {
  const f = fixture([item(1), item(2)]);
  f.failures.count = true;
  const failed = await f.actions.deleteNotificationAction(id(1), "member-a");
  assert.equal(failed.ok, false);
  assert.equal(failed.error, "읽지 않은 알림 수를 확인하지 못했습니다.");
  assert.deepEqual(f.rows.map((row) => row.id), [id(2)]);
  f.failures.count = false;
  const retried = await f.actions.deleteNotificationAction(id(1), "member-a");
  assert.equal(retried.ok, true);
  assert.equal(retried.unreadCount, 1);
  assert.deepEqual(f.rows.map((row) => row.id), [id(2)]);
});

test("unexpected deletion dependency failures return a generic error and do not remove notifications", async () => {
  const f = fixture([item(1)]);
  f.failures.service = true;
  const result = await f.actions.deleteNotificationAction(id(1), "member-a");
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /PRIVATE_SERVICE_FAILURE/);
  assert.equal(f.rows.length, 1);
  assert.equal(f.writes.length, 0);
});

test("delete-all removes the complete account snapshot regardless of read state or loaded page", async () => {
  const seed = Array.from({ length: 30 }, (_, index) => item(index + 1, {
    read_at: index % 2 ? "2026-09-27T01:00:00.000Z" : null,
  }));
  seed.push(item(100, { user_id: "member-b" }), item(101, { user_id: "member-b", read_at: "2026-09-27T01:00:00.000Z" }));
  const f = fixture(seed);
  const page = await f.actions.listNotificationsAction({ expectedUserId: "member-a" });
  assert.equal(page.items.length, 20);
  assert.ok(page.nextCursor);
  f.advance(5_000);
  const later = [
    item(31, { created_at: "2026-09-27T12:00:00.000001Z" }),
    item(32, { created_at: "2026-09-27T12:00:01.000Z", read_at: "2026-09-27T12:00:02.000Z" }),
  ];
  f.rows.push(...later);
  const preserved = structuredClone(f.rows.filter((row) => row.user_id !== "member-a" || [id(31), id(32)].includes(row.id)));
  const result = await f.actions.deleteAllNotificationsAction(page.cutoff, "member-a");
  assert.equal(result.ok, true);
  assert.equal(result.userId, "member-a");
  assert.equal(result.unreadCount, 1);
  assert.deepEqual(f.rows, preserved);
  assert.equal(f.writes[0].ids.length, 30);
  assert.deepEqual(f.writes[0].filters, [["eq", "user_id", "member-a"], ["lte", "created_at", page.cutoff]]);
  assert.equal(f.writes[0].operation, "delete");
});

test("delete-all includes the exact cutoff and preserves a notification one microsecond later", async () => {
  const cutoff = "2026-09-27T11:00:00.123456Z";
  const f = fixture([
    item(1, { created_at: "2026-09-27T11:00:00.123455Z" }),
    item(2, { created_at: cutoff }),
    item(3, { created_at: "2026-09-27T20:00:00.123456+09:00", read_at: cutoff }),
    item(4, { created_at: "2026-09-27T11:00:00.123457Z" }),
    item(5, { created_at: "2026-09-27T20:00:00.123457+09:00" }),
    item(6, { user_id: "member-b", created_at: cutoff }),
  ]);
  const result = await f.actions.deleteAllNotificationsAction(cutoff, "member-a");
  assert.equal(result.ok, true);
  assert.equal(result.unreadCount, 2);
  assert.deepEqual(f.writes[0].ids, [id(1), id(2), id(3)]);
  assert.deepEqual(f.rows.map((row) => row.id), [id(4), id(5), id(6)]);
  assert.deepEqual(f.writes[0].filters[1], ["lte", "created_at", cutoff]);
});

test("delete-all on an empty inbox is idempotent and does not touch other accounts", async () => {
  const f = fixture([item(1, { user_id: "member-b" })]);
  const cutoff = "2026-09-27T12:00:00.000Z";
  const first = await f.actions.deleteAllNotificationsAction(cutoff, "member-a");
  const again = await f.actions.deleteAllNotificationsAction(cutoff, "member-a");
  assert.equal(first.ok, true);
  assert.equal(first.unreadCount, 0);
  assert.deepEqual(first, again);
  assert.deepEqual(f.rows.map((row) => row.id), [id(1)]);
  assert.ok(f.writes.every((write) => write.ids.length === 0));
});

test("delete-all rejects missing, invalid, or future cutoffs and invalid account inputs before writes", async () => {
  const valid = "2026-09-27T12:00:00.000Z";
  for (const input of [
    [undefined, "member-a"], [null, "member-a"], ["", "member-a"],
    ["not-a-date", "member-a"], ["2026-09-27T12:00:02.000Z", "member-a"],
    ["2026-09-27T12:00:00.000Z),user_id.eq.member-b", "member-a"],
    [valid, undefined], [valid, null], [valid, ""],
  ]) {
    const f = fixture([item(1)]);
    assert.equal((await f.actions.deleteAllNotificationsAction(...input)).ok, false);
    assert.equal(f.queries.length, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.rows.length, 1);
  }
});

test("delete-all rejects expired sessions and account switches without querying notifications", async () => {
  for (const auth of [{ userId: null }, { authError: true }, { userId: "member-b" }]) {
    const f = fixture([item(1), item(2, { user_id: "member-b" })], auth);
    assert.equal((await f.actions.deleteAllNotificationsAction("2026-09-27T12:00:00.000Z", "member-a")).ok, false);
    assert.equal(f.queries.length, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.rows.length, 2);
  }
});

test("failed delete-all preserves every notification and safely retries the same snapshot", async () => {
  const f = fixture([item(1), item(2, { read_at: "2026-09-27T01:00:00.000Z" }), item(3, { user_id: "member-b" })]);
  const cutoff = "2026-09-27T12:00:00.000Z";
  f.failures.write = true;
  const failed = await f.actions.deleteAllNotificationsAction(cutoff, "member-a");
  assert.equal(failed.ok, false);
  assert.doesNotMatch(failed.error, /write failed/);
  assert.equal(f.rows.length, 3);
  assert.equal(f.writes.length, 0);
  f.failures.write = false;
  f.rows.push(item(4, { created_at: "2026-09-27T12:00:00.000001Z" }));
  const retried = await f.actions.deleteAllNotificationsAction(cutoff, "member-a");
  assert.equal(retried.ok, true);
  assert.equal(retried.unreadCount, 1);
  assert.deepEqual(f.rows.map((row) => row.id), [id(3), id(4)]);
});

test("delete-all count failure can be retried without deleting notifications newer than its original cutoff", async () => {
  const f = fixture([item(1), item(2, { user_id: "member-b" })]);
  const cutoff = "2026-09-27T12:00:00.000Z";
  f.failures.count = true;
  const failed = await f.actions.deleteAllNotificationsAction(cutoff, "member-a");
  assert.equal(failed.ok, false);
  assert.equal(failed.error, "읽지 않은 알림 수를 확인하지 못했습니다.");
  assert.deepEqual(f.rows.map((row) => row.id), [id(2)]);
  f.rows.push(item(3, { created_at: "2026-09-27T12:00:00.000001Z" }));
  f.failures.count = false;
  const retried = await f.actions.deleteAllNotificationsAction(cutoff, "member-a");
  assert.equal(retried.ok, true);
  assert.equal(retried.unreadCount, 1);
  assert.deepEqual(f.rows.map((row) => row.id), [id(2), id(3)]);
  assert.deepEqual(f.writes[1].ids, []);
});

test("unexpected delete-all dependency failures remain generic and leave notifications intact", async () => {
  const f = fixture([item(1)]);
  f.failures.service = true;
  const result = await f.actions.deleteAllNotificationsAction("2026-09-27T12:00:00.000Z", "member-a");
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error, /PRIVATE_SERVICE_FAILURE/);
  assert.equal(f.rows.length, 1);
  assert.equal(f.writes.length, 0);
});
