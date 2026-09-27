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
const profileId = "02f86d84-4940-419b-bf87-dc9e5632fb3e";
const otherProfileId = "e5f4d63f-7200-421c-9132-d6d24b5a791e";
const files = {
  diagnostics: "lib/firebase/push-device-diagnostics.ts",
  binding: "lib/firebase/push-device-binding.ts",
  actions: "app/profile/notification-actions.ts",
  authorize: "app/api/push/authorize/route.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, filename]) => [key,
  ts.transpileModule(readFileSync(path.join(root, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText,
]));

function fixture({ owner = "user-b", token = "browser-token", userId = "user-b", consent = true, withProfile = true } = {}) {
  const profiles = withProfile ? [{ id: profileId, user_id: owner, fcm_token: token }] : [];
  const users = ["user-b", "user-c"].map((id) => ({ id, marketing_opt_in: consent }));
  const notifications = [];
  const cookies = new Map();
  const writes = [];
  const operations = [];
  const logs = [];
  const cookieFailures = new Map();
  let authError = null;
  let authException = null;
  let queryFailure = null;
  let currentUser = userId;
  const db = { profiles, users, notifications };
  const cookieStore = {
    get(name) {
      if (cookieFailures.has("get")) throw cookieFailures.get("get");
      return cookies.has(name) ? { value: cookies.get(name) } : undefined;
    },
    set(name, value, options) {
      if (cookieFailures.has("set")) throw cookieFailures.get("set");
      cookies.set(name, value); writes.push({ name, value, options });
    },
    delete(name) {
      if (cookieFailures.has("delete")) throw cookieFailures.get("delete");
      return cookies.delete(name);
    },
  };
  class Query {
    constructor(table, service) { this.table = table; this.service = service; this.kind = "select"; this.filters = []; }
    select() { return this; }
    eq(field, value) { this.filters.push((row) => row[field] === value); return this; }
    is(field, value) { this.filters.push((row) => row[field] === value); return this; }
    update(values) { this.kind = "update"; this.values = values; return this; }
    insert(values) { this.kind = "insert"; this.values = values; return this; }
    delete() { this.kind = "delete"; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.execute()).then(resolve, reject); }
    execute() {
      operations.push({ table: this.table, service: this.service, kind: this.kind, values: this.values });
      const failure = queryFailure?.(this);
      if (failure) return { data: null, error: failure === true ? { code: "DB_UNAVAILABLE" } : failure };
      let rows = db[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      if (!this.service && this.table === "profiles") rows = rows.filter((row) => row.user_id === currentUser);
      if (this.kind === "insert") {
        if (profiles.some((row) => row.fcm_token === this.values.fcm_token)) return { data: null, error: { code: "23505" } };
        const row = { id: profiles.length ? otherProfileId : profileId, ...this.values };
        db[this.table].push(row);
        rows = [row];
      }
      if (this.kind === "update") rows.forEach((row) => Object.assign(row, this.values));
      if (this.kind === "delete") {
        for (const row of rows) db[this.table].splice(db[this.table].indexOf(row), 1);
      }
      return { data: structuredClone(this.one ? rows[0] ?? null : rows), error: null };
    }
  }
  const auth = {
    async getUser() {
      if (authException) throw authException;
      return { data: { user: currentUser ? { id: currentUser } : null }, error: authError };
    },
  };
  const client = { auth, from: (table) => new Query(table, false) };
  const service = { from: (table) => new Query(table, true) };
  const modules = {};
  const env = { NODE_ENV: "production", SUPABASE_SECRET_KEY: "test-only-key-never-used-for-network" };
  function load(key) {
    if (modules[key]) return modules[key];
    const loadedModule = { exports: {} };
    const dependencies = {
      "server-only": {}, "node:crypto": nativeRequire("node:crypto"),
      "next/headers": { cookies: async () => cookieStore },
      "next/cache": { revalidatePath() {} },
      "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/supabase/service": { createServiceClient: () => service },
    };
    if (key !== "diagnostics") dependencies["@/lib/firebase/push-device-diagnostics"] = load("diagnostics");
    if (key === "actions" || key === "authorize") dependencies["@/lib/firebase/push-device-binding"] = load("binding");
    vm.runInThisContext(`(function(require,module,exports,process,console){${source[key]}\n})`, { filename: files[key] })(
      (name) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
      loadedModule, loadedModule.exports, { env }, { error: (...args) => logs.push(args) },
    );
    modules[key] = loadedModule.exports;
    return loadedModule.exports;
  }
  return {
    profiles, users, notifications, cookies, writes, operations, env, logs,
    diagnostics: load("diagnostics"),
    binding: load("binding"), actions: load("actions"), authorize: load("authorize"),
    signIn: (id) => { currentUser = id; authError = null; authException = null; },
    failAuth: (error) => { authError = error; },
    throwAuth: (error) => { authException = error; },
    failQuery: (callback) => { queryFailure = callback; },
    failCookies: (operation, error) => cookieFailures.set(operation, error),
  };
}

test("owned legacy registration receives a signed HttpOnly host cookie without replacing its token", async () => {
  const f = fixture();
  const state = await f.actions.getPushDeviceStatusAction("browser-token");
  assert.deepEqual(state, { ok: true, userId: "user-b", marketingOptIn: true, registered: true });
  assert.equal(f.profiles[0].fcm_token, "browser-token");
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].name, "__Host-sokna-push-device");
  assert.deepEqual(f.writes[0].options, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  const receipt = JSON.parse(Buffer.from(f.writes[0].value.split(".")[0], "base64url").toString());
  assert.equal(receipt.profileId, profileId);
  assert.match(receipt.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(Object.values(receipt).includes("browser-token"), false);
});

test("logout detaches only the verified device while retaining its row, token, and receipt", async () => {
  const f = fixture();
  f.profiles.push({ id: otherProfileId, user_id: "user-b", fcm_token: "other-device" });
  await f.actions.getPushDeviceStatusAction("browser-token");
  const cookie = f.cookies.get(f.binding.PUSH_DEVICE_COOKIE);
  assert.equal((await f.actions.detachPushDeviceAction("browser-token")).ok, true);
  assert.deepEqual(f.profiles.map((row) => [row.user_id, row.fcm_token]), [[null, "browser-token"], ["user-b", "other-device"]]);
  assert.equal(f.cookies.get(f.binding.PUSH_DEVICE_COOKIE), cookie);
});

test("confirmed session loss unbinds a verified device and a subsequent login rebinds the same row", async () => {
  const f = fixture();
  await f.actions.getPushDeviceStatusAction("browser-token");
  f.signIn(null);
  f.failAuth({ name: "AuthSessionMissingError" });
  const signedOut = await f.actions.getPushDeviceStatusAction("browser-token");
  assert.equal(signedOut.ok, true);
  assert.equal(signedOut.userId, null);
  assert.equal(f.profiles[0].user_id, null);
  f.signIn("user-c");
  const signedIn = await f.actions.getPushDeviceStatusAction("browser-token");
  assert.equal(signedIn.registered, true);
  assert.equal(f.profiles[0].id, profileId);
  assert.equal(f.profiles[0].user_id, "user-c");
  assert.equal(f.profiles[0].fcm_token, "browser-token");
});

test("an opted-out next account still owns the device while authorization blocks delivery", async () => {
  const f = fixture();
  await f.actions.getPushDeviceStatusAction("browser-token");
  f.signIn("user-c");
  f.users.find((row) => row.id === "user-c").marketing_opt_in = false;
  const state = await f.actions.getPushDeviceStatusAction("browser-token");
  assert.equal(state.registered, true);
  assert.equal(state.marketingOptIn, false);
  assert.equal(f.profiles[0].user_id, "user-c");
  const authorized = await f.authorize.GET();
  assert.equal(authorized.body.userId, null);
  assert.equal(authorized.status, 200);
});

test("missing receipt cannot transfer another account's or an unbound registration", async () => {
  for (const owner of ["user-b", null]) {
    const f = fixture({ userId: "user-c", owner });
    const state = await f.actions.getPushDeviceStatusAction("browser-token");
    assert.equal(state.registered, false);
    assert.equal(f.profiles[0].user_id, owner);
    assert.equal((await f.actions.registerPushTokenAction("browser-token", "browser", "user-c")).ok, false);
    assert.equal((await f.actions.refreshPushTokenAction("browser-token", "new-token", "browser", "user-c")).ok, false);
    assert.equal(f.profiles[0].fcm_token, "browser-token");
    assert.equal(f.profiles[0].user_id, owner);
  }
});

test("tampered, expired, wrong-key, or stale-token receipts cannot authorize or transfer a device", async () => {
  for (const variant of ["tampered", "expired", "wrong-key", "stale-token"]) {
    const f = fixture();
    await f.actions.getPushDeviceStatusAction("browser-token");
    const name = f.binding.PUSH_DEVICE_COOKIE;
    const value = f.cookies.get(name);
    if (variant === "tampered") f.cookies.set(name, (value.startsWith("a") ? "b" : "a") + value.slice(1));
    if (variant === "expired") {
      const data = JSON.parse(Buffer.from(value.split(".")[0], "base64url").toString());
      data.expiresAt = 1;
      const body = Buffer.from(JSON.stringify(data)).toString("base64url");
      const signature = nativeRequire("node:crypto").createHmac("sha256", f.env.SUPABASE_SECRET_KEY)
        .update("sokna:push-device-receipt:v1\0").update(body).digest("base64url");
      f.cookies.set(name, `${body}.${signature}`);
    }
    if (variant === "wrong-key") f.env.SUPABASE_SECRET_KEY = "rotated-server-key";
    if (variant === "stale-token") f.profiles[0].fcm_token = "new-server-token";
    f.signIn("user-c");
    const state = await f.actions.getPushDeviceStatusAction("browser-token");
    assert.equal(state.registered, false, variant);
    assert.equal(f.profiles[0].user_id, "user-b", variant);
    assert.equal((await f.authorize.GET()).body.userId, null, variant);
  }
});

test("auth errors and account lookup errors neither detach nor reassign registrations", async () => {
  for (const variant of ["auth-error", "auth-throw", "account-error"]) {
    const f = fixture();
    await f.actions.getPushDeviceStatusAction("browser-token");
    f.signIn("user-c");
    if (variant === "auth-error") f.failAuth({ name: "AuthRetryableFetchError", status: 503 });
    if (variant === "auth-throw") f.throwAuth(new Error("offline"));
    if (variant === "account-error") f.failQuery((query) => query.table === "users");
    assert.equal((await f.actions.getPushDeviceStatusAction("browser-token")).ok, false);
    assert.equal(f.profiles[0].user_id, "user-b");
    if (variant !== "account-error") {
      assert.equal((await f.actions.detachPushDeviceAction("browser-token")).ok, false);
      assert.equal((await f.authorize.GET()).status, 503);
    }
  }
});

test("registration creates an own row and receipt but requires current identity and consent", async () => {
  const f = fixture({ withProfile: false });
  assert.equal((await f.actions.registerPushTokenAction("fresh-token", "browser", "user-c")).ok, false);
  assert.equal(f.profiles.length, 0);
  assert.equal((await f.actions.registerPushTokenAction("fresh-token", "browser", "user-b")).ok, true);
  assert.equal(f.profiles[0].user_id, "user-b");
  assert.equal((await f.binding.getReceiptPushProfile("fresh-token")).id, profileId);
  const optedOut = fixture({ withProfile: false, consent: false });
  assert.equal((await optedOut.actions.registerPushTokenAction("fresh-token", "browser", "user-b")).ok, false);
  assert.equal(optedOut.profiles.length, 0);
});

test("refresh preserves an existing opted-out device, rotates its receipt, and never recreates a removed row", async () => {
  const f = fixture();
  await f.actions.getPushDeviceStatusAction("browser-token");
  f.users[0].marketing_opt_in = false;
  assert.equal((await f.actions.refreshPushTokenAction("browser-token", "rotated-token", "browser", "user-b")).ok, true);
  assert.equal(f.profiles[0].id, profileId);
  assert.equal(f.profiles[0].fcm_token, "rotated-token");
  assert.equal(await f.binding.getReceiptPushProfile("browser-token"), null);
  assert.equal((await f.binding.getReceiptPushProfile("rotated-token")).id, profileId);
  f.profiles.splice(0);
  assert.equal((await f.actions.refreshPushTokenAction("rotated-token", "again", "browser", "user-b")).ok, false);
  assert.equal(f.profiles.length, 0);
});

test("authorization is read-only and permits only matching session, signed receipt, bound profile, and consent", async () => {
  const f = fixture();
  assert.equal((await f.authorize.GET()).body.userId, null);
  await f.actions.getPushDeviceStatusAction("browser-token");
  const authorized = await f.authorize.GET();
  assert.equal(authorized.body.userId, "user-b");
  assert.match(authorized.headers["Cache-Control"], /no-store/);
  assert.equal(authorized.headers.Vary, "Cookie");
  f.signIn("user-c");
  assert.equal((await f.authorize.GET()).body.userId, null);
  assert.equal(f.profiles[0].user_id, "user-b");
  f.signIn(null);
  assert.equal((await f.authorize.GET()).body.userId, null);
  assert.equal(f.profiles[0].user_id, "user-b");
  f.signIn("user-b");
  f.failQuery((query) => query.table === "users");
  assert.equal((await f.authorize.GET()).status, 503);
});

test("explicitly disabling this verified device deletes only its row and clears its receipt", async () => {
  const f = fixture();
  await f.actions.getPushDeviceStatusAction("browser-token");
  f.profiles.push({ id: otherProfileId, user_id: "user-b", fcm_token: "other-device" });
  assert.equal((await f.actions.unregisterPushTokenAction("browser-token")).ok, true);
  assert.deepEqual(f.profiles.map((row) => row.fcm_token), ["other-device"]);
  assert.equal(f.cookies.has(f.binding.PUSH_DEVICE_COOKIE), false);
});

test("notification recovery returns fresh own content only after session, device, and consent verification", async () => {
  const f = fixture();
  const id = "a12aabbc-f15f-4c76-a01d-6b4c97856b32";
  f.notifications.push({ id, user_id: "user-b", title: "새 알림", body: "현재 서버 본문", link: "/members", created_at: new Date().toISOString() });
  const request = () => new Request(`https://sokna.test/api/push/authorize?notificationId=${id}`);
  assert.equal((await f.authorize.GET(request())).body.userId, null);
  await f.actions.getPushDeviceStatusAction("browser-token");
  const allowed = await f.authorize.GET(request());
  assert.equal(allowed.body.userId, "user-b");
  assert.equal(allowed.body.notification.id, id);
  assert.equal(allowed.body.notification.body, "현재 서버 본문");
  assert.match(allowed.headers["Cache-Control"], /no-store/);
  assert.deepEqual((await f.authorize.GET()).body, { userId: "user-b" });
  f.users[0].marketing_opt_in = false;
  assert.deepEqual((await f.authorize.GET(request())).body, { userId: null });
});

test("notification recovery gives the same denial for foreign, absent, malformed, and expired identifiers", async () => {
  const f = fixture();
  await f.actions.getPushDeviceStatusAction("browser-token");
  const foreign = "72ccf4fa-a963-4612-b04d-96b944c3c413";
  const expired = "d12c7057-8a64-4be0-b578-b46b3292f73d";
  f.notifications.push(
    { id: foreign, user_id: "user-c", title: "타 계정", body: "비공개", link: "/", created_at: new Date().toISOString() },
    { id: expired, user_id: "user-b", title: "만료 알림", body: "오래된 본문", link: "/", created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString() },
  );
  for (const query of [`notificationId=${foreign}`, `notificationId=${expired}`,
    "notificationId=80ba37dc-10ec-46b0-9dba-3872f235f58b", "notificationId=not-a-uuid", "notificationId=",
    `notificationId=${foreign}&notificationId=${expired}`]) {
    const denied = await f.authorize.GET(new Request(`https://sokna.test/api/push/authorize?${query}`));
    assert.equal(denied.status, 200);
    assert.deepEqual(denied.body, { userId: null });
  }
});

test("temporary notification lookup failures return 503 without content or device mutations", async () => {
  const f = fixture();
  await f.actions.getPushDeviceStatusAction("browser-token");
  f.failQuery((query) => query.table === "notifications");
  const result = await f.authorize.GET(new Request("https://sokna.test/api/push/authorize?notificationId=80ba37dc-10ec-46b0-9dba-3872f235f58b"));
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { userId: null });
  assert.equal(f.profiles[0].user_id, "user-b");
});


test("device actions log only safe auth metadata and preserve registrations on auth failure", async () => {
  for (const throws of [false, true]) {
    const f = fixture();
    const sensitive = "secret-token-cookie-user-credential";
    const failure = Object.assign(new Error(sensitive), {
      code: "bad_jwt", status: 401, details: sensitive, hint: sensitive,
      cause: { token: sensitive }, userId: sensitive, stack: sensitive,
    });
    if (throws) f.throwAuth(failure); else f.failAuth(failure);
    const result = await f.actions.getPushDeviceStatusAction("browser-token");
    assert.equal(result.ok, false);
    assert.deepEqual(f.logs, [["[push-device] operation failed", { action: "status", stage: "session", code: "bad_jwt", status: 401 }]]);
    assert.equal(JSON.stringify([f.logs, result]).includes(sensitive), false);
    assert.equal(f.profiles[0].user_id, "user-b");
    assert.equal(f.operations.length, 0);
    assert.equal(f.writes.length, 0);
  }
});

test("receipt failures distinguish cookie reading, signing, writing, and clearing", async () => {
  for (const operation of ["get", "sign", "set", "delete"]) {
    const f = fixture();
    if (operation === "delete") await f.actions.getPushDeviceStatusAction("browser-token");
    if (operation === "sign") delete f.env.SUPABASE_SECRET_KEY;
    else f.failCookies(operation, new Error("private cookie value and browser token"));
    const result = operation === "delete"
      ? await f.actions.unregisterPushTokenAction("browser-token")
      : await f.actions.getPushDeviceStatusAction("browser-token");
    assert.equal(result.ok, false);
    const stage = { get: "receipt-read", sign: "receipt-sign", set: "receipt-write", delete: "receipt-clear" }[operation];
    assert.deepEqual(f.logs, [["[push-device] operation failed", { action: operation === "delete" ? "unregister" : "status", stage }]]);
    assert.equal(JSON.stringify(f.logs).includes("private cookie"), false);
  }
});

test("toggle registration and token refresh retain receipt write failures in server diagnostics", async () => {
  for (const action of ["register", "refresh"]) {
    const f = fixture();
    if (action === "refresh") await f.actions.getPushDeviceStatusAction("browser-token");
    f.failCookies("set", new Error("Cookies can only be modified in a Server Action"));
    const result = action === "register"
      ? await f.actions.registerPushTokenAction("browser-token", "private device name", "user-b")
      : await f.actions.refreshPushTokenAction("browser-token", "private rotated token", "private device name", "user-b");
    assert.equal(result.ok, false);
    assert.deepEqual(f.logs, [["[push-device] operation failed", { action, stage: "receipt-write" }]]);
    assert.equal(JSON.stringify(f.logs).includes("private"), false);
  }
});

test("returned database errors retain their failing action and query stage", async () => {
  const cases = [
    { action: "status", stage: "consent-read", table: "users", run: (f) => f.actions.getPushDeviceStatusAction("browser-token") },
    { action: "status", stage: "own-profile-read", table: "profiles", run: (f) => f.actions.getPushDeviceStatusAction("browser-token") },
    { action: "status", stage: "receipt-profile-read", receipt: true, table: "profiles", run: (f) => f.actions.getPushDeviceStatusAction("browser-token") },
    { action: "status", stage: "profile-bind", receipt: true, kind: "update", setup: (f) => f.signIn("user-c"), run: (f) => f.actions.getPushDeviceStatusAction("browser-token") },
    { action: "register", stage: "profile-insert", kind: "insert", run: (f) => f.actions.registerPushTokenAction("fresh-token", "browser", "user-b") },
    { action: "refresh", stage: "profile-refresh", receipt: true, kind: "update", run: (f) => f.actions.refreshPushTokenAction("browser-token", "fresh-token", "browser", "user-b") },
    { action: "unregister", stage: "profile-delete", receipt: true, kind: "delete", run: (f) => f.actions.unregisterPushTokenAction("browser-token") },
    { action: "enable-consent", stage: "consent-write", kind: "update", run: (f) => f.actions.enableMarketingOptInAction() },
  ];
  for (const scenario of cases) {
    const f = fixture();
    if (scenario.receipt) await f.actions.getPushDeviceStatusAction("browser-token");
    scenario.setup?.(f);
    f.failQuery((query) => (!scenario.table || query.table === scenario.table) && (!scenario.kind || query.kind === scenario.kind)
      ? { code: "42501", status: 403, message: "private query and credentials", details: "private token", hint: "private cookie" } : null);
    const result = await scenario.run(f);
    assert.equal(result.ok, false, scenario.stage);
    assert.deepEqual(f.logs, [["[push-device] operation failed", { action: scenario.action, stage: scenario.stage, code: "42501", status: 403 }]], scenario.stage);
    assert.equal(JSON.stringify(f.logs).includes("private"), false);
  }
});

test("thrown database failures receive the same safe stage metadata as returned failures", async () => {
  const f = fixture();
  f.failQuery((query) => {
    if (query.table === "profiles") throw Object.assign(new Error("sensitive request headers"), { code: "PGRST003", status: 503 });
    return null;
  });
  assert.equal((await f.actions.getPushDeviceStatusAction("browser-token")).ok, false);
  assert.deepEqual(f.logs, [["[push-device] operation failed", { action: "status", stage: "own-profile-read", code: "PGRST003", status: 503 }]]);
});

test("unknown error codes, arbitrary statuses and raw provider text never enter diagnostics", async () => {
  for (const status of ["503", 200, 600, Infinity, 401.5]) {
    const f = fixture();
    const secret = "private-token-cookie-user-id-credential";
    f.failAuth({ code: secret, status, message: secret, details: secret, cause: secret, stack: secret });
    assert.equal((await f.actions.getPushDeviceStatusAction("browser-token")).ok, false);
    assert.deepEqual(f.logs, [["[push-device] operation failed", { action: "status", stage: "session" }]]);
  }
});
