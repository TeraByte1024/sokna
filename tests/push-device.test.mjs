import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSource(relativePath, mocks, globals = {}) {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    console: { error() {} }, Event, ...globals,
  }, { filename })((name) => {
    assert.ok(Object.hasOwn(mocks, name), `Missing boundary mock: ${name}`);
    return mocks[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

function fixture({ owner = null, registered = true, granted = true, supported = true, receipt = true } = {}) {
  let now = Date.now();
  const values = new Map([["sokna-fcm-token", "old-token"]]);
  if (owner) values.set("sokna-fcm-token-owner", owner);
  const rows = new Map(registered ? [["old-token", "user-a"]] : []);
  const calls = [];
  const account = { userId: "user-a", consent: true, error: null };
  const browser = { token: "old-token", beforeGetToken: null, beforeStatus: null, authChanged: null, receipt, detachError: null, closedNotifications: 0, messages: [] };
  const window = new EventTarget();
  window.Notification = { permission: granted ? "granted" : "default" };
  window.PushManager = {};
  window.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const document = new EventTarget();
  document.visibilityState = "visible";
  const actions = {
    async getPushDeviceStatusAction(token) {
      calls.push("status");
      if (account.error) return { ok: false, error: account.error };
      if (rows.has(token) && (browser.receipt || (account.userId && rows.get(token) === account.userId))) {
        browser.receipt = true;
        rows.set(token, account.userId);
      }
      const result = { ok: true, userId: account.userId, marketingOptIn: Boolean(account.userId && account.consent), registered: Boolean(account.userId && rows.get(token) === account.userId) };
      await browser.beforeStatus?.();
      return result;
    },
    async detachPushDeviceAction(token) {
      calls.push("detach");
      if (browser.detachError) return { ok: false, error: browser.detachError };
      if (!browser.receipt) return { ok: false, error: "device receipt missing" };
      if (rows.has(token)) rows.set(token, null);
      return { ok: true };
    },
    async refreshPushTokenAction(previous, token, _deviceName, userId) {
      calls.push("refresh");
      if (!account.consent || account.userId !== userId || rows.get(previous) !== userId) return { ok: false, error: "registration removed" };
      rows.delete(previous);
      rows.set(token, userId);
      return { ok: true };
    },
    async registerPushTokenAction(token, _deviceName, userId) {
      calls.push("register");
      if (userId !== account.userId || !account.consent || (rows.has(token) && rows.get(token) !== userId)) return { ok: false, error: "ownership conflict" };
      rows.set(token, userId);
      return { ok: true };
    },
    async unregisterPushTokenAction(token) {
      calls.push("unregister");
      if (rows.get(token) === account.userId) rows.delete(token);
      return { ok: true };
    },
  };
  const controller = { postMessage: (message) => browser.messages.push(message.type) };
  const registration = { active: controller, getNotifications: async () => [{ close: () => browser.closedNotifications++ }] };
  const device = loadSource("lib/firebase/push-device.ts", {
    "@/app/profile/notification-actions": actions,
    "@/lib/firebase/pushNotification": {
      async isPushNotificationSupported() { calls.push("support"); return supported; },
      async getFcmToken() {
        calls.push("getToken");
        await browser.beforeGetToken?.();
        return { data: browser.token, error: null };
      },
      async deleteFcmToken() { calls.push("deleteToken"); browser.token = "new-token"; return { data: true, error: null }; },
    },
    "@/lib/supabase/client": {
      createClient: () => ({ auth: { onAuthStateChange: (callback) => {
        browser.authChanged = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      } } }),
    },
  }, {
    window, document, Notification: window.Notification,
    Date: class extends Date { static now() { return now; } },
    navigator: { userAgent: "test-browser", serviceWorker: { controller, getRegistration: async () => registration, register: async () => registration, ready: Promise.resolve(registration) } },
  });
  return { device, calls, rows, values, account, browser, window, document, advance: (ms) => { now += ms; } };
}

test("legacy local tokens become ON only after current account, browser and server verification", async () => {
  const f = fixture();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  assert.equal(f.values.get("sokna-fcm-token-owner"), "user-a");
  assert.ok(f.calls.includes("getToken"));
  assert.ok(!f.calls.includes("refresh"), "an unchanged token does not need a server write");
  assert.ok(!f.calls.includes("register"));
});

test("a server-removed registration stays OFF after consent is re-enabled on another device", async () => {
  const f = fixture({ owner: "user-a", registered: false });
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.ok(!f.calls.includes("getToken"));
  assert.ok(!f.calls.includes("register"));
  assert.equal(f.rows.size, 0);
  await f.device.enablePushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  assert.equal(f.rows.get("old-token"), "user-a");
});

test("automatic token renewal updates an existing row instead of creating a registration", async () => {
  const f = fixture({ owner: "user-a" });
  f.browser.token = "refreshed-token";
  await f.device.refreshPushDevice();
  assert.equal(f.rows.has("old-token"), false);
  assert.equal(f.rows.get("refreshed-token"), "user-a");
  assert.equal(f.values.get("sokna-fcm-token"), "refreshed-token");
  assert.ok(!f.calls.includes("register"));
});

test("a registration removed while getToken runs is not resurrected", async () => {
  const f = fixture({ owner: "user-a" });
  f.browser.beforeGetToken = () => { f.rows.clear(); f.browser.token = "refreshed-token"; };
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.equal(f.rows.size, 0);
  assert.ok(!f.calls.includes("register"));
});

test("an authenticated device receipt rebinds the same token to the new consenting account", async () => {
  const f = fixture({ owner: "user-a" });
  f.account.userId = "user-b";
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  assert.equal(f.rows.get("old-token"), "user-b");
  assert.ok(!f.calls.includes("deleteToken"));
  assert.equal(f.values.get("sokna-fcm-token-owner"), "user-b");
  assert.equal(f.browser.token, "old-token");
  assert.ok(f.browser.closedNotifications > 0);
});

test("a confirmed signed-out session clears only the recipient binding and preserves the device", async () => {
  const f = fixture({ owner: "user-a" });
  f.account.userId = null;
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.equal(f.rows.get("old-token"), null);
  assert.equal(f.rows.has("old-token"), true);
  assert.equal(f.values.get("sokna-fcm-token"), "old-token");
  assert.equal(f.values.has("sokna-fcm-token-owner"), false);
  assert.equal(f.browser.token, "old-token");
  assert.ok(!f.calls.includes("deleteToken"));
});

test("Firebase support checks disable unsupported browsers and do not request permission", async () => {
  const f = fixture({ granted: false, supported: false });
  await f.device.refreshPushDevice(true);
  assert.equal(f.device.getPushDeviceSnapshot().permission, "unsupported");
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.ok(f.calls.includes("support"));
  assert.ok(!f.calls.includes("getToken"));
});

test("a browser token error cannot leave a stale local token showing ON", async () => {
  const f = fixture();
  f.browser.beforeGetToken = () => { throw new Error("push service unavailable"); };
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.equal(f.device.getPushDeviceSnapshot().isChecking, false);
});

test("auth changes during a running validation discard its ON result and run another check", async () => {
  const f = fixture();
  let releaseToken;
  let tokenStarted;
  const started = new Promise((resolve) => { tokenStarted = resolve; });
  f.browser.beforeGetToken = () => { tokenStarted(); return new Promise((resolve) => { releaseToken = resolve; }); };
  const cleanup = f.device.startPushDeviceSync();
  await started;
  const states = [];
  f.device.subscribePushDevice(() => states.push(f.device.getPushDeviceSnapshot().hasRegisteredToken));
  f.account.userId = null;
  f.browser.authChanged("SIGNED_OUT");
  releaseToken();
  await f.device.refreshPushDevice();
  await new Promise(setImmediate);
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.equal(f.device.getPushDeviceSnapshot().userId, null);
  assert.ok(states.every((value) => value === false));
  assert.ok(f.calls.filter((call) => call === "status").length >= 2);
  assert.equal(f.rows.get("old-token"), null);
  cleanup();
});

test("logout followed by another login preserves the token and leaves other devices attached", async () => {
  const f = fixture({ owner: "user-a" });
  f.rows.set("another-device-token", "user-a");
  const cleanup = f.device.startPushDeviceSync();
  await f.device.refreshPushDevice();
  const suspended = await f.device.suspendPushDeviceForSignOut();
  assert.equal(suspended.ok, true);
  assert.equal(f.rows.get("old-token"), null);
  assert.equal(f.rows.get("another-device-token"), "user-a");
  assert.equal(f.values.get("sokna-fcm-token"), "old-token");
  assert.equal(f.values.has("sokna-fcm-token-owner"), false);
  // Focus/token events before auth.signOut completes must not bind back to A.
  f.window.dispatchEvent(new Event("focus"));
  await f.device.refreshPushDevice();
  assert.equal(f.rows.get("old-token"), null);
  f.account.userId = null;
  f.browser.authChanged("SIGNED_OUT", null);
  await f.device.refreshPushDevice();
  f.account.userId = "user-c";
  f.browser.authChanged("SIGNED_IN", { user: { id: "user-c" } });
  await f.device.refreshPushDevice();
  assert.equal(f.rows.get("old-token"), "user-c");
  assert.equal(f.rows.get("another-device-token"), "user-a");
  assert.equal(f.values.get("sokna-fcm-token"), "old-token");
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  assert.ok(f.browser.messages.includes("SOKNA_PUSH_SESSION_CHANGED"));
  assert.ok(f.browser.closedNotifications > 0);
  assert.ok(!f.calls.includes("deleteToken"));
  assert.ok(!f.calls.includes("unregister"));
  cleanup();
});

test("a non-consenting new account replaces the old binding while its device toggle stays OFF", async () => {
  const f = fixture({ owner: "user-a" });
  f.account.userId = "user-c";
  f.account.consent = false;
  await f.device.refreshPushDevice();
  assert.equal(f.rows.get("old-token"), "user-c");
  assert.equal(f.values.get("sokna-fcm-token-owner"), "user-c");
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.equal(f.device.getPushDeviceSnapshot().hasMarketingConsent, false);
  assert.equal(f.browser.token, "old-token");
  assert.ok(!f.calls.includes("deleteToken"));
  assert.ok(!f.calls.includes("getToken"));
});

test("an authentication error never detaches or deletes an existing device", async () => {
  const f = fixture({ owner: "user-a" });
  f.account.error = "authentication network error";
  await f.device.refreshPushDevice();
  assert.equal(f.rows.get("old-token"), "user-a");
  assert.equal(f.values.get("sokna-fcm-token-owner"), "user-a");
  assert.equal(f.browser.token, "old-token");
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.ok(!f.calls.includes("detach"));
  assert.ok(!f.calls.includes("deleteToken"));
});

test("a legacy token without a device receipt cannot be silently assigned to a different account", async () => {
  const f = fixture({ owner: "user-a", receipt: false });
  f.account.userId = "user-c";
  await f.device.refreshPushDevice();
  assert.equal(f.rows.get("old-token"), "user-a");
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.equal(f.browser.token, "old-token");
  assert.ok(!f.calls.includes("deleteToken"));
  assert.ok(!f.calls.includes("register"));
});

test("detach failures are reported without deleting the device, and a failed auth logout can resume", async () => {
  const f = fixture({ owner: "user-a" });
  f.browser.detachError = "temporary detach failure";
  const result = await f.device.suspendPushDeviceForSignOut();
  assert.equal(result.ok, false);
  assert.match(result.error, /detach/);
  assert.equal(f.values.get("sokna-fcm-token"), "old-token");
  assert.equal(f.rows.get("old-token"), "user-a");
  assert.ok(!f.calls.includes("deleteToken"));
  await f.device.resumePushDeviceAfterSignOutFailure();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  assert.equal(f.values.get("sokna-fcm-token-owner"), "user-a");
});

test("cross-tab local token removal revalidates the shared UI state", async () => {
  const f = fixture();
  const cleanup = f.device.startPushDeviceSync();
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  f.values.delete("sokna-fcm-token");
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: "sokna-fcm-token" });
  f.window.dispatchEvent(event);
  await f.device.refreshPushDevice();
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  cleanup();
});

test("another tab's logout marker prevents a stale authenticated session from rebinding the device", async () => {
  const f = fixture({ owner: "user-a" });
  const cleanup = f.device.startPushDeviceSync();
  await f.device.refreshPushDevice();
  f.rows.set("old-token", null);
  f.values.set("sokna-push-signing-out", JSON.stringify({ userId: "user-a", until: Date.now() + 30_000 }));
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: "sokna-push-signing-out" });
  f.window.dispatchEvent(event);
  await f.device.refreshPushDevice();
  assert.equal(f.rows.get("old-token"), null);
  assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
  assert.equal(f.values.get("sokna-fcm-token"), "old-token");
  f.account.userId = null;
  f.browser.authChanged("SIGNED_OUT", null);
  await f.device.refreshPushDevice();
  assert.equal(f.values.has("sokna-push-signing-out"), false);
  assert.equal(f.rows.get("old-token"), null);
  cleanup();
});

function serverFixture({ userId = "user-a", rowOwner = "user-a", rowPresent = true } = {}) {
  const row = rowPresent ? { id: 1, user_id: rowOwner, fcm_token: "old-token" } : null;
  const writes = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from(table) {
      const filters = [];
      let update;
      const result = () => {
        if (table === "users") return { data: { marketing_opt_in: true }, error: null };
        const matched = row && filters.every(([key, value]) => row[key] === value);
        if (matched && update) Object.assign(row, update);
        return { data: matched ? [row] : [], error: null };
      };
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        update(value) { update = value; writes.push({ operation: "update", filters }); return query; },
        upsert() { throw new Error("Unexpected creation of a registration"); },
        single: async () => result(),
        maybeSingle: async () => { const data = result(); return { ...data, data: table === "users" ? data.data : data.data[0] ?? null }; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const boundaries = {
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "@/lib/firebase/push-device-diagnostics": loadSource("lib/firebase/push-device-diagnostics.ts", { "server-only": {} }),
    "@/lib/supabase/service": { createServiceClient: () => client },
    "@/lib/firebase/push-device-binding": {
      getPushSession: async () => ({ supabase: client, user: userId ? { id: userId } : null }),
      getReceiptPushProfile: async () => null,
      issuePushDeviceReceipt: async () => {},
      clearPushDeviceReceipt: async () => {},
    },
  };
  const actions = loadSource("app/profile/notification-actions.ts", {
    ...boundaries,
    "@/lib/push-consent": loadSource("lib/push-consent.ts", {}),
    "@/lib/firebase/push-device-service": loadSource("lib/firebase/push-device-service.ts", boundaries),
  });
  return { actions, writes, row };
}

test("server refresh refuses missing rows and rows belonging to another account", async () => {
  for (const options of [{ rowPresent: false }, { rowOwner: "user-b" }]) {
    const f = serverFixture(options);
    const result = await f.actions.refreshPushTokenAction("old-token", "new-token", "browser", "user-a");
    assert.equal(result.ok, false);
    assert.equal(f.writes.length, 0);
    if (f.row) assert.equal(f.row.fcm_token, "old-token");
  }
});

test("server refresh replaces an owned token and rejects account changes before writing", async () => {
  const f = serverFixture();
  assert.equal((await f.actions.refreshPushTokenAction("old-token", "new-token", "browser", "user-a")).ok, true);
  assert.equal(f.row.fcm_token, "new-token");
  const changed = serverFixture({ userId: "user-b" });
  assert.equal((await changed.actions.refreshPushTokenAction("old-token", "new-token", "browser", "user-a")).ok, false);
  assert.equal((await changed.actions.registerPushTokenAction("new-token", "browser", "user-a")).ok, false);
  assert.equal(changed.writes.length, 0);
});

test("token deletion also unsubscribes the custom root worker through the public Push API", async () => {
  const calls = [];
  const messaging = loadSource("lib/firebase/pushNotification.ts", {
    "firebase/messaging": { deleteToken: async () => { calls.push("deleteToken"); return true; } },
    "@/lib/firebase/firebase": { getSupportedMessaging: async () => ({}) },
  }, {
    navigator: { serviceWorker: { getRegistration: async (scope) => {
      assert.equal(scope, "/");
      return { pushManager: { getSubscription: async () => ({ unsubscribe: async () => { calls.push("unsubscribeRoot"); return true; } }) } };
    } } },
  });
  assert.equal((await messaging.deleteFcmToken()).data, true);
  assert.deepEqual(calls, ["unsubscribeRoot", "deleteToken"]);
});


test("focus, visible and same-account auth events share one in-flight device check", async () => {
  const f = fixture({ owner: "user-a" });
  const cleanup = f.device.startPushDeviceSync();
  try {
    await f.device.refreshPushDevice();
    f.calls.length = 0;
    f.advance(1_001);
    let startedToken;
    let releaseToken;
    const started = new Promise((resolve) => { startedToken = resolve; });
    f.browser.beforeGetToken = () => {
      startedToken();
      return new Promise((resolve) => { releaseToken = resolve; });
    };
    f.window.dispatchEvent(new Event("focus"));
    await started;
    f.document.dispatchEvent(new Event("visibilitychange"));
    f.window.dispatchEvent(new Event("online"));
    f.browser.authChanged("SIGNED_IN", { user: { id: "user-a" } });
    f.browser.authChanged("TOKEN_REFRESHED", { user: { id: "user-a" } });
    const pending = f.device.refreshPushDevice();
    releaseToken();
    await pending;
    await new Promise(setImmediate);
    assert.equal(f.calls.filter((call) => call === "status").length, 1);
    assert.equal(f.calls.filter((call) => call === "getToken").length, 1);
    assert.equal(f.calls.filter((call) => call === "refresh").length, 0);
    assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  } finally { cleanup(); }
});

test("passive events inside one second reuse a finished check and later resumes query again", async () => {
  const f = fixture();
  const cleanup = f.device.startPushDeviceSync();
  await f.device.refreshPushDevice();
  f.calls.length = 0;
  for (const type of ["focus", "online", "focus"]) f.window.dispatchEvent(new Event(type));
  f.document.dispatchEvent(new Event("visibilitychange"));
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 0);
  f.advance(1_001);
  f.window.dispatchEvent(new Event("focus"));
  f.document.dispatchEvent(new Event("visibilitychange"));
  await new Promise(setImmediate);
  assert.equal(f.calls.filter((call) => call === "status").length, 1);
  cleanup();
  f.advance(1_001);
  f.window.dispatchEvent(new Event("focus"));
  f.document.dispatchEvent(new Event("visibilitychange"));
  await new Promise(setImmediate);
  assert.equal(f.calls.filter((call) => call === "status").length, 1, "unmount removes passive listeners");
});

test("account, permission and explicit settings changes bypass the passive cooldown", async () => {
  const f = fixture({ owner: "user-a" });
  const cleanup = f.device.startPushDeviceSync();
  try {
    await f.device.refreshPushDevice();
    f.calls.length = 0;
    f.account.userId = "user-b";
    f.browser.authChanged("SIGNED_IN", { user: { id: "user-b" } });
    await new Promise(setImmediate);
    assert.equal(f.rows.get("old-token"), "user-b");
    assert.equal(f.calls.filter((call) => call === "status").length, 1);
    assert.equal(f.calls.filter((call) => call === "refresh").length, 0);
    f.window.Notification.permission = "denied";
    f.window.dispatchEvent(new Event("focus"));
    f.document.dispatchEvent(new Event("visibilitychange"));
    await new Promise(setImmediate);
    assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
    assert.equal(f.calls.filter((call) => call === "status").length, 2);
    f.account.consent = false;
    f.window.dispatchEvent(new Event("sokna-push-token-change"));
    await new Promise(setImmediate);
    assert.equal(f.device.getPushDeviceSnapshot().hasMarketingConsent, false);
    assert.equal(f.calls.filter((call) => call === "status").length, 3);
  } finally { cleanup(); }
});

test("a token rotated during a later passive check is updated once despite duplicate resume events", async () => {
  const f = fixture({ owner: "user-a" });
  const cleanup = f.device.startPushDeviceSync();
  try {
    await f.device.refreshPushDevice();
    f.calls.length = 0;
    f.advance(1_001);
    f.browser.token = "rotated-token";
    f.window.dispatchEvent(new Event("focus"));
    f.document.dispatchEvent(new Event("visibilitychange"));
    await new Promise(setImmediate);
    assert.equal(f.calls.filter((call) => call === "status").length, 1);
    assert.equal(f.calls.filter((call) => call === "refresh").length, 1);
    assert.equal(f.rows.get("rotated-token"), "user-a");
    assert.equal(f.rows.has("old-token"), false);
  } finally { cleanup(); }
});


test("rapid A to B to A auth changes discard B's delayed status instead of restoring its binding", async () => {
  const f = fixture({ owner: "user-a" });
  const cleanup = f.device.startPushDeviceSync();
  try {
    await f.device.refreshPushDevice();
    f.browser.authChanged("INITIAL_SESSION", { user: { id: "user-a" } });
    const publishedOwners = [];
    f.device.subscribePushDevice(() => publishedOwners.push(f.device.getPushDeviceSnapshot().userId));
    let releaseStatus;
    let statusStarted;
    const started = new Promise((resolve) => { statusStarted = resolve; });
    f.browser.beforeStatus = () => {
      f.browser.beforeStatus = null;
      statusStarted();
      return new Promise((resolve) => { releaseStatus = resolve; });
    };
    f.account.userId = "user-b";
    f.browser.authChanged("SIGNED_IN", { user: { id: "user-b" } });
    await started;
    f.account.userId = "user-a";
    f.browser.authChanged("SIGNED_IN", { user: { id: "user-a" } });
    releaseStatus();
    await f.device.refreshPushDevice();
    await new Promise(setImmediate);
    assert.equal(f.device.getPushDeviceSnapshot().userId, "user-a");
    assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
    assert.equal(f.values.get("sokna-fcm-token-owner"), "user-a");
    assert.equal(f.rows.get("old-token"), "user-a");
    assert.ok(!publishedOwners.includes("user-b"), "the stale account response must never be published");
  } finally { cleanup(); }
});


test("online recovery retries immediately after a failed device check instead of caching the failure", async () => {
  const f = fixture();
  f.account.error = "offline";
  const cleanup = f.device.startPushDeviceSync();
  try {
    await f.device.refreshPushDevice();
    assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, false);
    f.account.error = null;
    f.advance(100);
    f.window.dispatchEvent(new Event("online"));
    f.window.dispatchEvent(new Event("focus"));
    await new Promise(setImmediate);
    assert.equal(f.calls.filter((call) => call === "status").length, 2);
    assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  } finally { cleanup(); }
});

test("online events during a failing request arrange only one recovery check after it settles", async () => {
  const f = fixture();
  let startedStatus;
  let rejectStatus;
  const started = new Promise((resolve) => { startedStatus = resolve; });
  f.browser.beforeStatus = () => {
    f.browser.beforeStatus = null;
    startedStatus();
    return new Promise((_resolve, reject) => { rejectStatus = reject; });
  };
  const cleanup = f.device.startPushDeviceSync();
  try {
    await started;
    f.window.dispatchEvent(new Event("online"));
    f.window.dispatchEvent(new Event("online"));
    rejectStatus(new Error("request started offline"));
    await new Promise(setImmediate);
    assert.equal(f.calls.filter((call) => call === "status").length, 2);
    assert.equal(f.device.getPushDeviceSnapshot().hasRegisteredToken, true);
  } finally { cleanup(); }
});
