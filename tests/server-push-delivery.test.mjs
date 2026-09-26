import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url);
const sources = Object.fromEntries(["push-notifications"].map((name) => [name,
  ts.transpileModule(readFileSync(path.join(root, "lib", `${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText,
]));
const initialTime = Date.parse("2026-09-26T10:00:00Z");
const iso = (time = initialTime) => new Date(time).toISOString();

function fixture(seed = {}, responses = []) {
  let now = initialTime;
  let jitter = 0;
  const db = Object.fromEntries(["users", "profiles", "notifications"]
    .map((table) => [table, structuredClone(seed[table] ?? [])]));
  const sends = [];
  const queries = [];
  const logs = [];
  let failQuery = null;
  const client = { from: (table) => new Query(table) };
  class Query {
    constructor(table) { this.table = table; this.operation = "select"; this.filters = []; this.maximum = Infinity; }
    select() { return this; }
    update(values) { this.operation = "update"; this.values = values; return this; }
    delete() { this.operation = "delete"; return this; }
    eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
    is(key, value) { this.filters.push((row) => value === null ? row[key] == null : row[key] === value); return this; }
    in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
    lte(key, value) { this.filters.push((row) => row[key] != null && row[key] <= value); return this; }
    order(key, options) { this.sorts ??= []; this.sorts.push([key, options]); return this; }
    limit(value) { this.maximum = value; return this; }
    maybeSingle() { this.one = true; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
    execute() {
      queries.push({ table: this.table, operation: this.operation, values: structuredClone(this.values), options: this.options });
      if (failQuery?.(this)) return { data: null, error: { code: "DB_UNAVAILABLE" } };
      let rows = db[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      if (this.sorts) {
        rows.sort((a, b) => {
          for (const [key, { ascending, nullsFirst }] of this.sorts) {
            if ((a[key] == null) !== (b[key] == null)) return (a[key] == null ? -1 : 1) * (nullsFirst ? 1 : -1);
            const comparison = (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (ascending ? 1 : -1);
            if (comparison) return comparison;
          }
          return 0;
        });
      }
      rows = rows.slice(0, this.maximum);
      if (this.operation === "update") rows.forEach((row) => Object.assign(row, this.values));
      if (this.operation === "delete") db[this.table] = db[this.table].filter((row) => !rows.includes(row));
      return { data: structuredClone(this.one ? rows[0] ?? null : rows), error: null };
    }
  }
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const modules = {};
  function load(name) {
    if (modules[name]) return modules[name];
    const loadedModule = { exports: {} };
    const mocks = {
      "server-only": {},
      "node:crypto": nativeRequire("node:crypto"),
      "@/lib/supabase/service": { createServiceClient: () => client },
      "@/lib/firebase/admin": {
        getFirebaseAdminMessaging: () => ({
          async sendEachForMulticast(message) {
            sends.push(structuredClone(message));
            const response = responses.shift();
            if (response instanceof Error) throw response;
            const deliveries = typeof response === "function" ? await response(message) : response;
            return { responses: deliveries ?? message.tokens.map(() => ({ success: true })) };
          },
        }),
      },
    };
    const fakeMath = Object.create(Math);
    fakeMath.random = () => jitter;
    vm.runInThisContext(`(function(require,module,exports,console,Date,Math){${sources[name]}\n})`, { filename: `${name}.ts` })(
      (dependency) => { assert.ok(Object.hasOwn(mocks, dependency), `Unexpected dependency ${dependency}`); return mocks[dependency]; },
      loadedModule, loadedModule.exports, { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) }, FakeDate, fakeMath,
    );
    modules[name] = loadedModule.exports;
    return loadedModule.exports;
  }
  return {
    db, sends, queries, logs, push: load("push-notifications"),
    advance: (milliseconds) => { now += milliseconds; },
    setJitter: (value) => { jitter = value; },
    fail: (callback) => { failQuery = callback; },
  };
}

const account = (id = "member", marketing_opt_in = true) => ({ id, marketing_opt_in });
const device = (id, user_id = "member") => ({ id, user_id, fcm_token: `secret-token-${id}` });
const notification = (id = "event-a", user_id = "member", values = {}) => ({
  id, user_id, title: "새 알림", body: "본문", link: "/members", created_at: iso(),
  event_type: "nomination_added", event_key: "31", push_status: "pending",
  push_attempted_at: null, push_sent_at: null, push_error: null, push_attempts: 0, push_next_attempt_at: iso(),
  push_progress: { successfulProfileIds: [], failures: [] }, ...values,
});
const failure = (code) => ({ success: false, error: { code, message: "SECRET TOKEN MUST NOT BE STORED" } });
const success = { success: true };
const basic = (extra = {}) => ({ users: [account()], profiles: [device("phone")], notifications: [notification()], ...extra });

test("recipient logs distinguish a delivered account, no token, and no consent", async () => {
  const f = fixture(basic({
    users: [account(), account("no-device"), account("opted-out", false)],
    notifications: [notification(), notification("event-b", "no-device"), notification("event-c", "opted-out")],
  }));
  await f.push.processPendingPushNotifications();
  assert.deepEqual(f.db.notifications.map((row) => [row.push_status, row.push_error]), [
    ["accepted", null], ["skipped", "no_active_token"], ["skipped", "not_opted_in"],
  ]);
  assert.equal(f.sends.length, 1);
});

test("temporary FCM errors wait for cooldown then retry with the same event tag", async () => {
  const f = fixture(basic(), [[failure("messaging/server-unavailable")], [success]]);
  await f.push.processPendingPushNotifications({ notificationIds: ["event-a"] });
  assert.equal(f.db.notifications[0].push_status, "pending");
  assert.equal(f.db.notifications[0].push_progress.failures[0].code, "messaging/server-unavailable");
  assert.doesNotMatch(JSON.stringify(f.db.notifications[0].push_progress), /SECRET|secret-token/);
  await f.push.processPendingPushNotifications();
  assert.equal(f.sends.length, 1);
  f.advance(60_001);
  await f.push.processPendingPushNotifications();
  assert.equal(f.db.notifications[0].push_status, "accepted");
  assert.equal(f.sends[0].webpush.notification.tag, f.sends[1].webpush.notification.tag);
  assert.equal(f.sends[0].data.notificationId, "event-a");
});

test("partial success checkpoints completed devices and preserves permanent errors after retry", async () => {
  const f = fixture(basic({ profiles: [device("pc"), device("phone"), device("expired")] }), [
    [success, failure("messaging/internal-error"), failure("messaging/registration-token-not-registered")], [success],
  ]);
  await f.push.processPendingPushNotifications();
  const state = f.db.notifications[0].push_progress;
  assert.deepEqual(state.successfulProfileIds, ["pc"]);
  assert.equal(f.db.notifications[0].push_status, "pending");
  assert.ok(f.db.notifications[0].push_sent_at);
  assert.equal(f.db.profiles.some((row) => row.id === "expired"), false);
  f.advance(60_001);
  await f.push.processPendingPushNotifications();
  assert.deepEqual(f.sends[1].tokens, ["secret-token-phone"]);
  assert.equal(f.db.notifications[0].push_status, "failed");
  const final = f.db.notifications[0].push_progress;
  assert.deepEqual(final.successfulProfileIds, ["pc", "phone"]);
  assert.equal(final.failures[0].code, "messaging/registration-token-not-registered");
});

test("all permanent token failures are failed, and cleanup failures cannot turn success into a resend", async () => {
  const f = fixture(basic(), [[failure("messaging/invalid-registration-token")]]);
  f.fail((query) => query.table === "profiles" && query.operation === "delete");
  await f.push.processPendingPushNotifications();
  assert.equal(f.db.notifications[0].push_status, "failed");
  assert.equal(f.db.notifications[0].push_error, "permanent_delivery_failure");
  assert.match(f.db.notifications[0].push_progress.failures[0].code, /invalid-registration-token/);
  f.advance(60_001);
  await f.push.processPendingPushNotifications();
  assert.equal(f.sends.length, 1);
});

test("late invalid-token responses preserve a rotated token on the same profile and retry the replacement", async () => {
  const f = fixture(basic(), [() => {
    // Token refresh completes while FCM is still responding to the old token.
    f.db.profiles[0].fcm_token = "replacement-token-phone";
    return [failure("messaging/registration-token-not-registered")];
  }, [success]]);
  await f.push.processPendingPushNotifications();
  assert.deepEqual(f.sends[0].tokens, ["secret-token-phone"]);
  assert.equal(f.db.profiles.length, 1);
  assert.equal(f.db.profiles[0].fcm_token, "replacement-token-phone");
  assert.equal(f.db.notifications[0].push_status, "pending");
  const state = f.db.notifications[0].push_progress;
  assert.equal(state.failures[0].retryable, true);
  assert.doesNotMatch(JSON.stringify(f.db.notifications[0].push_progress), /secret-token|replacement-token/);
  f.advance(60_001);
  await f.push.processPendingPushNotifications();
  assert.deepEqual(f.sends[1].tokens, ["replacement-token-phone"]);
  assert.equal(f.db.notifications[0].push_status, "accepted");
  assert.equal(f.sends[0].data.tag, f.sends[1].data.tag);
});

test("thrown network errors are retryable without copying provider messages", async () => {
  const error = Object.assign(new Error("private-token-value"), { code: "app/network-error" });
  const f = fixture(basic(), [error]);
  await f.push.processPendingPushNotifications();
  assert.equal(f.db.notifications[0].push_status, "pending");
  assert.equal(f.db.notifications[0].push_error, "retryable_delivery_failure");
  assert.equal(f.db.notifications[0].push_progress.failures[0].code, "app/network-error");
  assert.doesNotMatch(JSON.stringify(f.db.notifications[0]), /private-token-value/);
});

test("cron recovers expired visibility timeouts while preserving active workers", async () => {
  const f = fixture(basic({ notifications: [
    notification("stale", "member", { push_attempted_at: iso(initialTime - 6 * 60_000), push_next_attempt_at: iso(initialTime - 60_000) }),
    notification("active", "member", { push_attempted_at: iso(initialTime - 30_000), push_next_attempt_at: iso(initialTime + 4.5 * 60_000) }),
  ] }));
  await f.push.processPendingPushNotifications();
  assert.deepEqual(f.db.notifications.map((row) => row.push_status), ["accepted", "pending"]);
  assert.equal(f.sends.length, 1);
});

test("the original notification expiry blocks both retries and never-attempted stale events", async () => {
  const old = iso(initialTime - 25 * 60 * 60_000);
  const f = fixture(basic({ notifications: [
    notification("expired", "member", { created_at: old, push_attempted_at: iso(initialTime - 120_000), push_error: "legacy error" }),
    notification("first-attempt", "member", { created_at: old }),
  ] }));
  await f.push.processPendingPushNotifications();
  assert.equal(f.db.notifications[0].push_status, "failed");
  assert.equal(f.db.notifications[0].push_error, "retry_window_expired");
  assert.equal(f.db.notifications[1].push_status, "failed");
  assert.equal(f.sends.length, 0);
});

test("malformed checkpoint entries preserve valid completed devices", async () => {
  const f = fixture(basic({ profiles: [device("pc"), device("phone")], notifications: [notification("event-a", "member", {
    push_progress: { successfulProfileIds: ["pc", null], failures: [null, { profileId: 42 }] },
  })] }));
  await f.push.processPendingPushNotifications();
  assert.deepEqual(f.sends[0].tokens, ["secret-token-phone"]);
  assert.deepEqual(f.db.notifications[0].push_progress.successfulProfileIds, ["pc", "phone"]);
});

test("concurrent workers cannot claim one event twice; distinct events use distinct tags", async () => {
  const f = fixture(basic());
  await Promise.all([f.push.processPendingPushNotifications({ notificationIds: ["event-a"] }), f.push.processPendingPushNotifications({ notificationIds: ["event-a"] })]);
  assert.equal(f.sends.length, 1);
  f.db.notifications.push(notification("event-b"));
  await f.push.processPendingPushNotifications({ notificationIds: ["event-b"] });
  assert.notEqual(f.sends[0].webpush.notification.tag, f.sends[1].webpush.notification.tag);
});

test("failed delivery-state writes retain a recoverable lease instead of returning false success", async () => {
  const f = fixture(basic());
  let failed = false;
  f.fail((query) => {
    if (!failed && query.table === "notifications" && query.values?.push_status === "accepted") { failed = true; return true; }
    return false;
  });
  await assert.rejects(f.push.processPendingPushNotifications());
  assert.equal(f.db.notifications[0].push_status, "pending");
  assert.equal(f.db.notifications[0].push_next_attempt_at, iso(initialTime + 5 * 60_000));
  await f.push.processPendingPushNotifications();
  assert.equal(f.sends.length, 1);
  f.advance(6 * 60_000);
  await f.push.processPendingPushNotifications();
  assert.equal(f.db.notifications[0].push_status, "accepted");
  assert.equal(f.sends[0].data.tag, f.sends[1].data.tag);
});

test("more than 500 device tokens are split into supported FCM batches", async () => {
  const f = fixture(basic({ profiles: Array.from({ length: 501 }, (_, index) => device(`device-${index}`)) }));
  await f.push.processPendingPushNotifications();
  assert.deepEqual(f.sends.map((message) => message.tokens.length), [500, 1]);
  assert.equal(f.db.notifications[0].push_status, "accepted");
});

test("multirecipient dispatch never mixes account tokens in a payload and names each recipient", async () => {
  const f = fixture(basic({ users: [account(), account("other")], profiles: [device("phone"), device("other-phone", "other")] }));
  await f.push.sendPushToUsers(["member", "other"], { title: "알림", body: "내용", url: "/", notificationId: "event-id" });
  assert.deepEqual(f.sends.map((message) => [message.data.recipientUserId, message.tokens]), [
    ["member", ["secret-token-phone"]], ["other", ["secret-token-other-phone"]],
  ]);
});

test("FCM TTL and payload expiry stay anchored to the original notification across retries", async () => {
  const createdAt = initialTime - 23 * 60 * 60_000;
  const f = fixture(basic({ notifications: [notification("event-a", "member", { created_at: iso(createdAt) })] }), [
    [failure("messaging/server-unavailable")], [success],
  ]);
  await f.push.processPendingPushNotifications();
  assert.equal(f.sends[0].webpush.headers.TTL, "3600");
  assert.equal(f.sends[0].data.expiresAt, String(createdAt + 24 * 60 * 60_000));
  f.advance(60_001);
  await f.push.processPendingPushNotifications();
  assert.equal(f.sends[1].data.expiresAt, f.sends[0].data.expiresAt);
  assert.equal(f.sends[1].webpush.headers.TTL, "3539");
});

test("temporary FCM failures back off for 1m, 5m, 15m, and 1h with persisted positive jitter", async () => {
  const f = fixture(basic(), Array.from({ length: 5 }, () => [failure("messaging/internal-error")]));
  f.setJitter(0.5);
  let currentTime = initialTime;
  for (const [index, base] of [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000].entries()) {
    await f.push.processPendingPushNotifications();
    const row = f.db.notifications[0];
    const delay = base * 1.1;
    assert.equal(row.push_attempts, index + 1);
    assert.equal(Date.parse(row.push_next_attempt_at), currentTime + delay);
    f.advance(delay - 1);
    await f.push.processPendingPushNotifications();
    assert.equal(f.sends.length, index + 1);
    f.advance(1);
    currentTime += delay;
  }
});

test("due-time filtering selects new events without scanning waiting retries", async () => {
  const waiting = Array.from({ length: 55 }, (_, index) => notification(`a-waiting-${index}`, "member", {
    push_attempted_at: iso(initialTime - 2 * 60_000),
    push_attempts: 4, push_next_attempt_at: iso(initialTime + 60 * 60_000),
  }));
  const f = fixture(basic({ notifications: [...waiting, notification("z-new-event")] }));
  await f.push.processPendingPushNotifications({ limit: 1 });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].data.notificationId, "z-new-event");
  assert.equal(f.queries.filter((query) => query.table === "notifications" && query.operation === "select").length, 1);
});

test("a retry scheduled near expiry is capped at expiry and cannot extend notification lifetime", async () => {
  const f = fixture(basic({ notifications: [notification("event-a", "member", {
    created_at: iso(initialTime - 24 * 60 * 60_000 + 30_000),
  })] }), [[failure("messaging/server-unavailable")]]);
  await f.push.processPendingPushNotifications();
  assert.equal(f.db.notifications[0].push_next_attempt_at, iso(initialTime + 30_000));
  f.advance(30_000);
  await f.push.processPendingPushNotifications();
  assert.equal(f.sends.length, 1);
  assert.equal(f.db.notifications[0].push_status, "failed");
});

test("immediate signup dispatch prioritizes new outboxes ahead of older backoff rows", async () => {
  const waiting = Array.from({ length: 20 }, (_, index) => notification(`old-${index}`, "member", {
    event_type: "member_approval_requested", push_attempted_at: iso(initialTime - 2 * 60_000),
    push_attempts: 4, push_next_attempt_at: iso(initialTime + 60 * 60_000),
  }));
  const f = fixture(basic({ notifications: [...waiting, notification("new-signup", "member", { event_type: "member_approval_requested", title: "Changed template title" })] }));
  await f.push.processPendingPushNotifications({ eventType: "member_approval_requested" });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].data.notificationId, "new-signup");
});


test("an expired worker cannot overwrite a newer retry lease or checkpoint", async () => {
  let releaseFirst;
  let signalFirst;
  const firstStarted = new Promise((resolve) => { signalFirst = resolve; });
  const firstReply = new Promise((resolve) => { releaseFirst = resolve; });
  const f = fixture(basic(), [async () => { signalFirst(); return firstReply; }, [failure("messaging/internal-error")]]);
  const firstRun = f.push.processPendingPushNotifications();
  await firstStarted;
  f.advance(6 * 60_000);
  await f.push.processPendingPushNotifications();
  const successor = structuredClone(f.db.notifications[0]);
  assert.equal(successor.push_status, "pending");
  assert.equal(successor.push_attempts, 2);
  releaseFirst([success]);
  assert.deepEqual(await firstRun, { processedCount: 0, sentCount: 0 });
  assert.deepEqual(f.db.notifications[0], successor);
});

test("event type, key, recipient, and optional IDs restrict one shared processor", async () => {
  const f = fixture(basic({ notifications: [
    notification("wanted", "member", { event_type: "member_approved", event_key: "signup-a" }),
    notification("wrong-type", "member", { event_type: "nomination_added", event_key: "signup-a" }),
    notification("wrong-key", "member", { event_type: "member_approved", event_key: "signup-b" }),
    notification("wrong-user", "other", { event_type: "member_approved", event_key: "signup-a" }),
    notification("wrong-id", "member", { event_type: "member_approved", event_key: "signup-a" }),
  ] }));
  await f.push.processPendingPushNotifications({ notificationIds: [] });
  assert.equal(f.queries.length, 0);
  await f.push.processPendingPushNotifications({ eventType: "member_approved", eventKey: "signup-a", userId: "member", notificationIds: ["wanted", "wrong-type", "wrong-key", "wrong-user"] });
  assert.deepEqual(f.sends.map((message) => message.data.notificationId), ["wanted"]);
  assert.equal(f.queries.filter((query) => query.table === "notifications" && query.operation === "select").length, 1);
});

test("terminal notifications stay closed after later opt-in and token registration", async () => {
  const f = fixture(basic({ notifications: [
    notification("opted-out", "member", { push_status: "skipped", push_error: "not_opted_in" }),
    notification("accepted", "member", { push_status: "accepted" }),
    notification("failed", "member", { push_status: "failed" }),
  ] }));
  await f.push.processPendingPushNotifications();
  assert.equal(f.sends.length, 0);
  assert.deepEqual(f.db.notifications.map((row) => row.push_status), ["skipped", "accepted", "failed"]);
});

test("consent withdrawal and detached devices are checked again before each retry", async () => {
  for (const change of ["consent", "device-account"]) {
    const f = fixture(basic(), [[failure("messaging/internal-error")]]);
    await f.push.processPendingPushNotifications();
    if (change === "consent") f.db.users[0].marketing_opt_in = false;
    else f.db.profiles[0].user_id = "another-account";
    f.advance(60_001);
    await f.push.processPendingPushNotifications();
    assert.equal(f.sends.length, 1);
    assert.equal(f.db.notifications[0].push_status, "skipped");
  }
});

test("failures crossing the original expiry during dispatch are terminal immediately", async () => {
  const f = fixture(basic({ notifications: [notification("event-a", "member", { created_at: iso(initialTime - 24 * 60 * 60_000 + 1_000) })] }), [() => {
    f.advance(2_000);
    return [failure("messaging/internal-error")];
  }]);
  await f.push.processPendingPushNotifications();
  assert.equal(f.db.notifications[0].push_status, "failed");
  assert.equal(f.db.notifications[0].push_error, "retry_window_expired");
});
