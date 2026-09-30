import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://sokna.example";
const currentUserId = "current-user";
const notificationId = "7b7f8804-972b-4709-9fcf-bc80fcfc7d5b";
const clone = (value) => JSON.parse(JSON.stringify(value));

// Event-based, in-memory IndexedDB subset. All persistence belongs to this test
// instance and can be shared by fixtures to simulate a restarted worker.
function mockIndexedDB() {
  const databases = new Map();
  let unavailable = false;
  return {
    fail(value = true) { unavailable = value; },
    snapshot() { return [...databases.values()].flatMap(stores => [...stores.values()].flatMap(store => [...store.rows.values()].map(clone))); },
    seed(records) {
      const rows = new Map(records.map(record => [record.key, clone(record)]));
      databases.set("sokna-push-recovery", new Map([["records", { keyPath: "key", rows }]]));
    },
    open(name) {
      const request = {};
      queueMicrotask(() => {
        if (unavailable) {
          request.error = new Error("IndexedDB unavailable");
          request.onerror?.({ target: request });
          return;
        }
        const upgrade = !databases.has(name);
        if (upgrade) databases.set(name, new Map());
        const stores = databases.get(name);
        const database = {
          objectStoreNames: { contains: (store) => stores.has(store) },
          createObjectStore(store, options = {}) {
            stores.set(store, { keyPath: options.keyPath, rows: new Map() });
          },
          close() {},
          transaction(storeNames) {
            const transaction = {};
            let pending = 0;
            let completion;
            const completeWhenIdle = () => {
              clearTimeout(completion);
              completion = setTimeout(() => {
                if (!pending) transaction.oncomplete?.({ target: transaction });
              }, 0);
            };
            transaction.objectStore = (name) => {
              assert.ok((Array.isArray(storeNames) ? storeNames : [storeNames]).includes(name));
              const store = stores.get(name);
              assert.ok(store, `Unknown object store ${name}`);
              const operation = (work) => {
                const result = {};
                pending++;
                queueMicrotask(() => {
                  try {
                    if (unavailable) throw new Error("IndexedDB transaction failed");
                    result.result = work();
                    result.onsuccess?.({ target: result });
                  } catch (error) {
                    result.error = error;
                    transaction.error = error;
                    result.onerror?.({ target: result });
                    transaction.onerror?.({ target: transaction });
                    transaction.onabort?.({ target: transaction });
                  } finally {
                    pending--;
                    completeWhenIdle();
                  }
                });
                return result;
              };
              return {
                get: (key) => operation(() => store.rows.has(key) ? clone(store.rows.get(key)) : undefined),
                getAll: () => operation(() => [...store.rows.values()].map(clone)),
                put: (value, suppliedKey) => operation(() => {
                  const key = suppliedKey ?? value[store.keyPath];
                  assert.notEqual(key, undefined);
                  store.rows.set(key, clone(value));
                  return key;
                }),
                delete: (key) => operation(() => { store.rows.delete(key); }),
                clear: () => operation(() => { store.rows.clear(); }),
              };
            };
            completeWhenIdle();
            return transaction;
          },
        };
        request.result = database;
        if (upgrade) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    },
  };
}

// Run the route's generated JavaScript, with no server, Firebase connection, or
// browser notification. TypeScript and the installed SDK are only read locally.
async function loadPushRoute() {
  const filename = path.join(root, "app/firebase-messaging-sw.js/route.ts");
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  const context = vm.createContext({
    exports: loadedModule.exports,
    module: loadedModule,
    process: { env: { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "mock-project" } },
    require(name) {
      if (name === "@/lib/firebase/push-worker-script") {
        const loaded = { exports: {} };
        const compiled = ts.transpileModule(readFileSync(path.join(root, "lib/firebase/push-worker-script.ts"), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        vm.runInNewContext(compiled, { exports: loaded.exports, module: loaded });
        return loaded.exports;
      }
      assert.equal(name, "next/server");
      return {
        NextResponse: class {
          constructor(body, options) {
            this.body = body;
            this.headers = options.headers;
          }
        },
      };
    },
  });
  vm.runInContext(source, context, { filename });
  return loadedModule.exports.GET();
}

// Keep the real SDK foreground/background decision and payload forwarding in
// the fixture: a later Firebase handler must not duplicate our notification.
const sdkSource = readFileSync(
  path.join(root, "node_modules/@firebase/messaging/dist/esm/index.sw.esm.js"),
  "utf8",
);
const sdkFunctions = [
  ["async function onPush(", "async function onNotificationClick("],
  ["function wrapInternalPayload(", "async function getWindowClient("],
  ["function hasVisibleClients(", "function getLink("],
].map(([start, end]) => {
  const from = sdkSource.indexOf(start);
  const to = sdkSource.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Installed Firebase SDK is missing ${start}`);
  return sdkSource.slice(from, to);
}).join("\n");

async function workerFixture(windows = [], database = mockIndexedDB(), activeNotifications = []) {
  const listeners = new Map();
  const shown = [];
  const posted = [];
  const pageMessages = [];
  const focused = [];
  const opened = [];
  const imported = [];
  const authorizationRequests = [];
  const closedNotifications = [];
  let authorization = { userId: currentUserId, ok: true };
  let recoveryNotification;
  let now = Date.now();
  const syncRequests = [];
  let authorizationGate;
  let displayGate;
  let displayError;
  const timers = new Map();
  let nextTimerId = 1;
  let notifyAuthorizationStarted;
  let notifyAuthorizationBodyStarted;
  let sdkPushCalls = 0;
  let sdkClickCalls = 0;
  const clients = windows.map((window, index) => ({
    url: `${origin}/page-${index}`,
    visibilityState: "hidden",
    ...window,
    postMessage(payload) {
      posted.push(clone(payload));
      if (window.hasPageListener) pageMessages.push(clone(payload));
    },
    async focus() {
      focused.push(this.url);
      return this;
    },
  }));
  const self = {
    location: { origin, href: `${origin}/firebase-messaging-sw.js` },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      async matchAll(options) {
        assert.deepEqual(clone(options), { type: "window", includeUncontrolled: true });
        return clients;
      },
      async openWindow(url) {
        opened.push(url);
        return { url };
      },
    },
    registration: {
      sync: { async register(tag) { syncRequests.push(tag); } },
      async showNotification(title, options) {
        if (displayGate) {
          const gate = displayGate;
          displayGate = undefined;
          gate.started();
          await gate.promise;
        }
        if (displayError) {
          const error = displayError;
          displayError = undefined;
          throw error;
        }
        shown.push({ title, options: clone(options) });
        const notification = {
          title, ...clone(options), closed: false,
          close() {
            this.closed = true;
            closedNotifications.push(this);
          },
        };
        activeNotifications.push(notification);
      },
      async getNotifications(options = {}) {
        return activeNotifications.filter((notification) => !notification.closed
          && (!options.tag || notification.tag === options.tag));
      },
    },
  };
  const sdkContext = vm.createContext({
    self, console, Notification: {}, FCM_MSG: "FCM_MSG",
    MessageType: { PUSH_RECEIVED: "push-received" },
  });
  vm.runInContext(sdkFunctions, sdkContext);
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    self, URL, console, indexedDB: database, AbortController, Date: FakeDate,
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, dueAt: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    async fetch(url, options) {
      const requestUrl = new URL(url, origin);
      assert.equal(requestUrl.pathname, "/api/push/authorize");
      const requestedId = requestUrl.searchParams.get("notificationId");
      authorizationRequests.push({ url, options: clone(options) });
      notifyAuthorizationStarted?.();
      const response = { ...authorization };
      if (authorizationGate) {
        const gate = authorizationGate;
        authorizationGate = undefined;
        gate.started();
        await gate.promise;
      }
      if (response.hang) {
        await new Promise((_, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("AbortError")), { once: true });
        });
      }
      if (response.error) throw response.error;
      return {
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 503),
        async json() {
          if (response.jsonHang) {
            notifyAuthorizationBodyStarted?.();
            await new Promise((_, reject) => {
              options.signal.addEventListener("abort", () => reject(new Error("AbortError")), { once: true });
            });
          }
          if (response.jsonError) throw response.jsonError;
          const notification = recoveryNotification === undefined ? {
            id: requestedId, title: "Fresh server title", body: "Fresh server body", link: "/members", created_at: new Date(now).toISOString(),
          } : recoveryNotification;
          return { userId: response.userId, ...(requestedId ? { notification } : {}) };
        },
      };
    },
    importScripts: (...urls) => imported.push(...urls),
    firebase: {
      initializeApp(config) {
        assert.equal(config.projectId, "mock-project");
      },
      messaging() {
        self.addEventListener("push", (event) => {
          sdkPushCalls += 1;
          event.waitUntil(sdkContext.onPush(event, {
            deliveryMetricsExportedToBigQueryEnabled: false,
            onBackgroundMessageHandler: null,
          }));
        });
        self.addEventListener("notificationclick", () => { sdkClickCalls += 1; });
      },
    },
  });
  const route = await loadPushRoute();
  vm.runInContext(route.body, context, { filename: "generated-firebase-messaging-sw.js" });

  async function dispatch(type, properties) {
    const promises = [];
    const event = {
      ...properties,
      stopped: false,
      stopImmediatePropagation() { this.stopped = true; },
      waitUntil(promise) { promises.push(promise); },
    };
    for (const listener of listeners.get(type) || []) {
      listener(event);
      if (event.stopped) break;
    }
    await Promise.all(promises);
    return event;
  }

  return {
    shown, posted, pageMessages, focused, opened, imported, route, authorizationRequests, closedNotifications, database, activeNotifications, syncRequests,
    get now() { return now; },
    advance(milliseconds) { now += milliseconds; },
    recoveryContent(value) { recoveryNotification = value; },
    authorizeAs(userId) { authorization = { userId, ok: true }; },
    failAuthorization(failure) { authorization = { userId: currentUserId, ok: true, ...failure }; },
    failNextDisplay() { displayError = new Error("OS notification display failed"); },
    hangAuthorization() {
      authorization = { userId: currentUserId, ok: true, hang: true };
      return new Promise((resolve) => { notifyAuthorizationStarted = resolve; });
    },
    hangAuthorizationBody() {
      authorization = { userId: currentUserId, ok: true, jsonHang: true };
      return new Promise((resolve) => { notifyAuthorizationBodyStarted = resolve; });
    },
    advanceTimers(delay) {
      now += delay;
      for (const [id, timer] of timers) {
        if (timer.dueAt <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    deferNextAuthorization() {
      let started;
      let release;
      const startedPromise = new Promise((resolve) => { started = resolve; });
      const promise = new Promise((resolve) => { release = resolve; });
      authorizationGate = { started, promise };
      return { started: startedPromise, release };
    },
    deferNextDisplay() {
      let started;
      let release;
      const startedPromise = new Promise((resolve) => { started = resolve; });
      const promise = new Promise((resolve) => { release = resolve; });
      displayGate = { started, promise };
      return { started: startedPromise, release };
    },
    get sdkPushCalls() { return sdkPushCalls; },
    get sdkClickCalls() { return sdkClickCalls; },
    push: (payload) => dispatch("push", { data: { json: () => clone(payload) } }),
    invalidPush: () => dispatch("push", { data: { json: () => { throw new SyntaxError("Invalid JSON"); } } }),
    emptyPush: () => dispatch("push", { data: null }),
    sessionChanged: () => dispatch("message", { data: { type: "SOKNA_PUSH_SESSION_CHANGED" }, source: { url: origin } }),
    recover: () => dispatch("message", { data: { type: "SOKNA_PUSH_RECOVERY" }, source: { url: origin } }),
    sync: () => dispatch("sync", { tag: "sokna-push-recovery" }),
    activate: () => dispatch("activate", {}),
    async click(data) {
      let closed = false;
      const event = await dispatch("notificationclick", {
        notification: { data, close: () => { closed = true; } },
      });
      assert.equal(closed, true);
      assert.equal(event.stopped, true);
      assert.equal(sdkClickCalls, 0);
    },
  };
}

const notificationPayload = (overrides = {}) => ({
  from: "mock-sender",
  fcmMessageId: "mock-message-1",
  notification: {
    title: "New candidate song",
    body: "A song was added to the meeting.",
    icon: "/icon-192.png",
    tag: "sokna-notification-101",
  },
  data: { url: "/gigs/42", notificationId: "101", tag: "sokna-notification-101", recipientUserId: currentUserId },
  fcmOptions: { link: `${origin}/gigs/42` },
  ...overrides,
});

const recoverablePayload = (overrides = {}) => {
  const payload = notificationPayload();
  return {
    ...payload, ...overrides,
    data: { ...payload.data, notificationId, expiresAt: String(Date.now() + 60 * 60_000), ...overrides.data },
  };
};

function assertPrivateContentAbsent(fixture) {
  assert.ok(fixture.shown.every(({ title, options }) => title !== "New candidate song"
    && options.body !== "A song was added to the meeting."));
}

for (const [name, windows] of [
  ["visible page with a listener", [{ visibilityState: "visible", hasPageListener: true }]],
  ["visible page before its listener starts", [{ visibilityState: "visible" }]],
  ["hidden page", [{ visibilityState: "hidden", hasPageListener: true }]],
  ["no open page", []],
  ["two visible pages", [{ visibilityState: "visible", hasPageListener: true }, { visibilityState: "visible", hasPageListener: true }]],
  ["visible page and hidden page", [{ visibilityState: "visible" }, { visibilityState: "hidden", hasPageListener: true }]],
]) {
  test(`notification push displays once with ${name}`, async () => {
    const f = await workerFixture(windows);
    await f.push(notificationPayload());
    assert.equal(f.shown.length, 1);
    assert.equal(f.sdkPushCalls, 0);
    assert.equal(f.posted.length, windows.length);
    assert.ok(f.posted.every(message => message.type === "SOKNA_NOTIFICATIONS_CHANGED"));
    assert.ok(f.pageMessages.every(message => message.type === "SOKNA_NOTIFICATIONS_CHANGED"));
  });
}

test("displayed notification preserves its content and click destination", async () => {
  const f = await workerFixture();
  const payload = notificationPayload();
  await f.push(payload);
  assert.equal(f.shown[0].title, payload.notification.title);
  assert.equal(f.shown[0].options.body, payload.notification.body);
  assert.equal(f.shown[0].options.icon, "/logos/logo_app_icon.png");
  assert.equal(f.shown[0].options.tag, "sokna-notification-101");
  assert.equal(f.shown[0].options.renotify, false);
  await f.click(f.shown[0].options.data);
  assert.deepEqual(f.opened, [`${origin}/gigs/42`]);
});

test("retries do not redisplay a completed notification while separate events stay separate", async () => {
  const f = await workerFixture();
  await f.push(notificationPayload());
  await f.push(notificationPayload({ fcmMessageId: "mock-message-retry" }));
  await f.push(notificationPayload({
    fcmMessageId: "mock-message-2",
    data: { notificationId: "102", url: "/gigs/42", recipientUserId: currentUserId },
    notification: { title: "Another song", body: "A separate event." },
  }));
  assert.equal(f.shown.length, 2);
  assert.notEqual(f.shown[0].options.tag, f.shown[1].options.tag);
  assert.ok(f.shown.every(({ options }) => options.renotify === false));
});

test("notification without optional display fields still displays", async () => {
  const f = await workerFixture();
  await f.push({ notification: { title: "Approval complete" }, data: { recipientUserId: currentUserId } });
  assert.equal(f.shown.length, 1);
  assert.equal(f.shown[0].title, "Approval complete");
});

test("empty notification payload uses readable content and the app icon", async () => {
  const f = await workerFixture();
  await f.push({ notification: {}, data: { recipientUserId: currentUserId } });
  assert.equal(f.shown.length, 1);
  assert.equal(f.shown[0].title, "소크나 알림");
  assert.equal(f.shown[0].options.body, "새로운 알림이 도착했습니다.");
  assert.equal(f.shown[0].options.icon, "/logos/logo_app_icon.png");
});

test("older payloads retain notification, data, or message tags", async () => {
  const f = await workerFixture();
  for (const [payload, tag] of [
    [{ notification: { title: "One", tag: "old-tag" } }, "old-tag"],
    [{ notification: { title: "Two" }, data: { tag: "data-tag" } }, "data-tag"],
    [{ notification: { title: "Three" }, fcmMessageId: "message-3" }, "sokna-message-message-3"],
  ]) {
    await f.push({ ...payload, data: { ...payload.data, recipientUserId: currentUserId } });
    assert.equal(f.shown.at(-1).options.tag, tag);
  }
});

test("notification push normalizes an external click target to the app", async () => {
  const f = await workerFixture();
  await f.push(notificationPayload({ data: { url: "https://other.example/members", recipientUserId: currentUserId } }));
  assert.equal(f.shown[0].options.data.url, `${origin}/`);
  await f.click(f.shown[0].options.data);
  assert.deepEqual(f.opened, [`${origin}/`]);
});

test("data-only foreground push falls through to the actual Firebase SDK", async () => {
  const f = await workerFixture([{ visibilityState: "visible", hasPageListener: true }]);
  await f.push({ data: { key: "value" } });
  assert.equal(f.sdkPushCalls, 1);
  assert.equal(f.shown.length, 0);
  assert.equal(f.pageMessages.length, 1);
  assert.equal(f.pageMessages[0].messageType, "push-received");
  assert.equal(f.authorizationRequests.length, 0);
});

test("data-only background push remains handled by Firebase", async () => {
  const f = await workerFixture();
  await f.push({ data: { key: "value" } });
  assert.equal(f.sdkPushCalls, 1);
  assert.equal(f.shown.length, 0);
  assert.equal(f.posted.length, 0);
  assert.equal(f.authorizationRequests.length, 0);
});

test("malformed JSON and empty push events do not display broken notifications", async () => {
  const f = await workerFixture();
  await f.invalidPush();
  await f.emptyPush();
  assert.equal(f.shown.length, 0);
});

test("notification click focuses the existing destination page", async () => {
  const f = await workerFixture([{ url: `${origin}/gigs/42`, visibilityState: "hidden" }]);
  await f.push(notificationPayload());
  await f.click(f.shown[0].options.data);
  assert.deepEqual(f.focused, [`${origin}/gigs/42`]);
  assert.deepEqual(f.opened, []);
});

test("notification click opens its destination if no matching page exists", async () => {
  const f = await workerFixture([{ url: `${origin}/profile` }]);
  await f.push(notificationPayload());
  await f.click(f.shown[0].options.data);
  assert.deepEqual(f.focused, []);
  assert.deepEqual(f.opened, [`${origin}/gigs/42`]);
});

for (const [name, data, target] of [
  ["Firebase wrapped notifications", { FCM_MSG: { data: { url: "/members", recipientUserId: currentUserId } } }, `${origin}/members`],
  ["Firebase configured links", { FCM_MSG: { data: { recipientUserId: currentUserId }, fcmOptions: { link: `${origin}/members` } } }, `${origin}/members`],
  ["direct relative links", { url: "/members" }, `${origin}/members`],
  ["direct same-origin absolute links", { url: `${origin}/members` }, `${origin}/members`],
  ["cross-origin links", { url: "https://other.example/members" }, `${origin}/`],
  ["protocol-relative external links", { url: "//other.example/members" }, `${origin}/`],
  ["JavaScript links", { url: "javascript:alert(1)" }, `${origin}/`],
  ["malformed URLs", { url: "https://[" }, `${origin}/`],
  ["missing links", {}, `${origin}/`],
]) {
  test(`notification click handles ${name}`, async () => {
    const f = await workerFixture();
    await f.click(data.FCM_MSG ? data : { ...data, recipientUserId: currentUserId });
    assert.deepEqual(f.opened, [target]);
  });
}

test("notification authorization uses current cookies and bypasses caches with no page open", async () => {
  const f = await workerFixture();
  await f.push(notificationPayload());
  assert.equal(f.shown.length, 1);
  assert.equal(f.authorizationRequests.length, 1);
  assert.equal(f.authorizationRequests[0].options.credentials, "include");
  assert.equal(f.authorizationRequests[0].options.cache, "no-store");
  assert.equal(f.authorizationRequests[0].options.redirect, "error");
});

test("a queued notification for B is blocked after C signs in, but C's notification is displayed", async () => {
  const f = await workerFixture([{ visibilityState: "visible" }]);
  f.authorizeAs("user-c");
  await f.push(notificationPayload({ data: { recipientUserId: "user-b", url: "/members" } }));
  assert.equal(f.shown.length, 0);
  assert.equal(f.sdkPushCalls, 0);
  assert.equal(f.posted.length, 0);
  await f.push(notificationPayload({ data: { recipientUserId: "user-c", url: "/members" } }));
  assert.equal(f.shown.length, 1);
});

test("signed-out browsers do not display account notifications", async () => {
  const f = await workerFixture();
  f.authorizeAs(null);
  await f.push(notificationPayload());
  assert.equal(f.shown.length, 0);
  assert.equal(f.sdkPushCalls, 0);
});

test("notifications without an explicit recipient never fall through to Firebase display", async () => {
  const f = await workerFixture();
  for (const recipientUserId of [undefined, null, "", 123]) {
    await f.push(notificationPayload({ data: { recipientUserId, url: "/members" } }));
  }
  assert.equal(f.shown.length, 0);
  assert.equal(f.sdkPushCalls, 0);
});

for (const [name, failure, fallback] of [
  ["network failure", { error: new Error("offline") }, true],
  ["HTTP failure", { ok: false }, true],
  ["malformed authorization response", { jsonError: new SyntaxError("invalid JSON") }, true],
  ["missing authorized user", { userId: undefined }, true],
]) {
  test(`notification authorization protects private content on ${name}`, async () => {
    const f = await workerFixture();
    f.failAuthorization(failure);
    await f.push(notificationPayload());
    assertPrivateContentAbsent(f);
    assert.equal(f.shown.length, fallback ? 1 : 0);
    if (fallback) {
      assert.equal(f.shown[0].title, "소크나 알림 확인 지연");
      assert.equal(f.shown[0].options.body, "앱의 알림 목록에서도 확인할 수 있습니다.");
      assert.equal(f.shown[0].options.silent, true);
    }
    assert.equal(f.sdkPushCalls, 0);
    assert.equal(f.posted.length, 0);
  });
}

test("clicking B's earlier notification after C signs in neither opens nor focuses a page", async () => {
  const f = await workerFixture([{ url: `${origin}/gigs/42` }]);
  f.authorizeAs("user-b");
  await f.push(notificationPayload({ data: { recipientUserId: "user-b", url: "/gigs/42" } }));
  assert.equal(f.shown.length, 1);
  f.authorizeAs("user-c");
  await f.click(f.shown[0].options.data);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.focused, []);
  assert.equal(f.authorizationRequests.length, 2);
});

test("notification clicks fail closed after logout or authorization failure", async () => {
  for (const failure of [{ userId: null }, { error: new Error("offline") }, { ok: false }]) {
    const f = await workerFixture([{ url: `${origin}/gigs/42` }]);
    await f.push(notificationPayload());
    f.failAuthorization(failure);
    await f.click(f.shown[0].options.data);
    assert.deepEqual(f.opened, []);
    assert.deepEqual(f.focused, []);
  }
});

test("legacy notifications without a recipient cannot open protected pages", async () => {
  const f = await workerFixture();
  for (const data of [undefined, { url: "/members" }, { FCM_MSG: { data: { url: "/members" } } }]) {
    await f.click(data);
  }
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.focused, []);
});

test("session changes close notifications already displayed for the previous login", async () => {
  const f = await workerFixture();
  await f.push(notificationPayload());
  assert.equal(f.shown.length, 1);
  await f.sessionChanged();
  assert.equal(f.closedNotifications.length, 1);
});

test("a session change while push authorization is pending blocks the stale response", async () => {
  const f = await workerFixture();
  const gate = f.deferNextAuthorization();
  const pendingPush = f.push(notificationPayload());
  await gate.started;
  const changed = f.sessionChanged();
  gate.release();
  await pendingPush;
  await changed;
  assert.equal(f.shown.length, 0);
  assert.equal(f.sdkPushCalls, 0);
});

test("a session change while click authorization is pending blocks navigation", async () => {
  const f = await workerFixture([{ url: `${origin}/gigs/42` }]);
  await f.push(notificationPayload());
  const gate = f.deferNextAuthorization();
  const pendingClick = f.click(f.shown[0].options.data);
  await gate.started;
  const changed = f.sessionChanged();
  gate.release();
  await pendingClick;
  await changed;
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.focused, []);
});

test("a notification finishing display after a session change is immediately closed", async () => {
  const f = await workerFixture();
  const gate = f.deferNextDisplay();
  const pendingPush = f.push(notificationPayload());
  await gate.started;
  const changed = f.sessionChanged();
  assert.equal(f.shown.length, 0);
  gate.release();
  await pendingPush;
  await changed;
  assert.equal(f.shown.length, 1);
  assert.equal(f.closedNotifications.length, 1);
  assert.equal(f.closedNotifications[0].data.recipientUserId, currentUserId);
});

test("closing a stale display never closes a notification for the new login", async () => {
  const f = await workerFixture();
  const gate = f.deferNextDisplay();
  const pendingOldPush = f.push(notificationPayload());
  await gate.started;
  const changed = f.sessionChanged();
  f.authorizeAs("new-user");
  const pendingNewPush = f.push(notificationPayload({
    data: { recipientUserId: "new-user", notificationId: "101", url: "/gigs/42" },
  }));
  gate.release();
  await pendingOldPush;
  await changed;
  await pendingNewPush;
  assert.equal(f.shown.length, 2);
  assert.equal(f.closedNotifications.length, 1);
  assert.equal(f.closedNotifications[0].data.recipientUserId, currentUserId);
});


test("temporary authorization failure persists only bounded recovery metadata, never private contents or tokens", async () => {
  const f = await workerFixture();
  f.failAuthorization({ error: new Error("private-provider-debug-value") });
  await f.push(recoverablePayload({ data: { token: "private-device-token", receiptToken: "obsolete-receipt", url: "/private/path" } }));
  assertPrivateContentAbsent(f);
  assert.equal(f.shown[0].title, "소크나 알림 확인 지연");
  assert.equal(f.shown[0].options.silent, true);
  const [pending] = f.database.snapshot().filter(record => record.kind === "pending");
  assert.deepEqual(Object.keys(pending).sort(), ["attempts", "expiresAt", "key", "kind", "nextAttemptAt", "notificationExpiresAt", "notificationId", "recipient"].sort());
  assert.equal(pending.notificationId, notificationId);
  assert.equal(pending.attempts, 0);
  assert.equal(pending.expiresAt, f.now + 15 * 60_000);
  const persisted = JSON.stringify(f.database.snapshot());
  for (const privateValue of ["New candidate song", "A song was added", "private-device-token", "obsolete-receipt", "/private/path", "private-provider-debug-value"]) {
    assert.ok(!persisted.includes(privateValue), privateValue);
  }
  assert.deepEqual(f.syncRequests, ["sokna-push-recovery"]);
});

test("the first recovery wake reauthorizes its ID and displays the current server body", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  f.authorizeAs(currentUserId);
  await f.recover();
  assert.equal(f.authorizationRequests.length, 2);
  assert.equal(f.authorizationRequests[1].url, "/api/push/authorize?notificationId=" + notificationId);
  assert.equal(f.authorizationRequests[1].options.credentials, "include");
  assert.equal(f.shown.length, 2);
  assert.equal(f.shown[1].title, "Fresh server title");
  assert.equal(f.shown[1].options.body, "Fresh server body");
  assert.equal(f.shown[1].options.data.url, origin + "/members");
  assert.equal(f.shown[1].options.tag, "sokna-notification-" + notificationId);
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
  assert.equal(f.database.snapshot().filter(record => record.kind === "handled").length, 1);
});

test("local recovery makes at most three attempts, spaced by one and three minutes", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  await f.recover();
  assert.equal(f.authorizationRequests.length, 2);
  assert.equal(f.database.snapshot().find(record => record.kind === "pending").attempts, 1);
  await f.recover();
  assert.equal(f.authorizationRequests.length, 2);
  f.advance(60_000);
  await f.recover();
  assert.equal(f.authorizationRequests.length, 3);
  await f.recover();
  assert.equal(f.authorizationRequests.length, 3);
  f.advance(3 * 60_000);
  await f.recover();
  assert.equal(f.authorizationRequests.length, 4);
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
  f.authorizeAs(currentUserId);
  f.advance(60_000);
  await f.recover();
  await f.push(recoverablePayload());
  assert.equal(f.authorizationRequests.length, 4);
  assert.equal(f.shown.length, 1);
});

test("redelivered pending pushes share the recovery cooldown and fetch fresh content when due", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  await f.recover();
  const pending = f.database.snapshot().find(record => record.kind === "pending");
  f.authorizeAs(currentUserId);
  await f.push(recoverablePayload());
  await f.push(recoverablePayload());
  assert.equal(f.authorizationRequests.length, 2);
  assert.deepEqual(f.database.snapshot().find(record => record.kind === "pending"), pending);
  assert.equal(f.shown.length, 1);
  f.advance(60_000);
  await f.push(recoverablePayload());
  assert.equal(f.authorizationRequests.length, 3);
  assert.equal(f.authorizationRequests.at(-1).url, "/api/push/authorize?notificationId=" + notificationId);
  assert.equal(f.shown.at(-1).title, "Fresh server title");
});

test("redelivery after a worker stops during its third recovery cannot start a fourth attempt", async () => {
  const database = mockIndexedDB();
  const first = await workerFixture([], database);
  first.failAuthorization({ ok: false, status: 503 });
  await first.push(recoverablePayload());
  await first.recover();
  first.advance(60_000);
  await first.recover();
  first.advance(3 * 60_000);
  const gate = first.deferNextAuthorization();
  const interrupted = first.recover();
  await gate.started;
  assert.equal(database.snapshot().find(record => record.kind === "pending").attempts, 3);
  // A fresh worker sees the committed attempt but no result from the old worker.
  const restarted = await workerFixture([], database);
  try {
    await restarted.push(recoverablePayload());
    assert.equal(restarted.authorizationRequests.length, 0);
    assert.equal(restarted.shown.length, 0);
    assert.equal(database.snapshot().filter(record => record.kind === "pending").length, 0);
  } finally {
    gate.release();
    await interrupted;
  }
});

for (const kind of ["handled", "pending"]) {
  test("more than 500 live records retain an earlier " + kind + " notification's recovery budget", async () => {
    const database = mockIndexedDB();
    const f = await workerFixture([], database);
    const expiry = f.now + 60 * 60_000;
    const target = kind === "handled" ? {
      key: "handled:" + currentUserId + ":" + notificationId, kind, expiresAt: expiry,
    } : {
      key: "pending:" + currentUserId + ":" + notificationId, kind, recipient: currentUserId,
      notificationId, attempts: 1, nextAttemptAt: f.now + 60_000,
      expiresAt: f.now + 15 * 60_000, notificationExpiresAt: expiry,
    };
    const otherRecords = Array.from({ length: 500 }, (_, index) => ({
      key: "handled:other-recipient:notification-" + index, kind: "handled", expiresAt: expiry + 1000,
    }));
    database.seed([target, ...otherRecords]);
    await f.push(recoverablePayload());
    assert.equal(f.authorizationRequests.length, 0);
    assert.equal(f.shown.length, 0);
    assert.equal(database.snapshot().length, 501);
    assert.deepEqual(database.snapshot().find(record => record.key === target.key), target);
    f.advance(61 * 60_000);
    await f.recover();
    assert.deepEqual(database.snapshot(), []);
  });
}

test("the fifteen-minute recovery budget expires permanently even if the same push arrives again", async () => {
  const f = await workerFixture();
  const payload = recoverablePayload();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(payload);
  f.advance(15 * 60_000);
  await f.recover();
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
  await f.push(payload);
  assert.equal(f.authorizationRequests.length, 1);
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
});

test("waiting records cannot block another due recovery after the first three entries", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  const ids = Array.from({ length: 4 }, (_, index) => "afcfa89c-795c-43b6-9985-" + String(index + 1).padStart(12, "0"));
  for (const id of ids.slice(0, 3)) await f.push(recoverablePayload({ data: { notificationId: id } }));
  await f.recover();
  assert.equal(f.authorizationRequests.length, 6);
  await f.push(recoverablePayload({ data: { notificationId: ids[3] } }));
  f.authorizeAs(currentUserId);
  await f.recover();
  assert.equal(f.authorizationRequests.at(-1).url, "/api/push/authorize?notificationId=" + ids[3]);
  assert.equal(f.shown.at(-1).title, "Fresh server title");
});

for (const invalidId of [undefined, null, "", "101", "not-a-uuid"]) {
  test("authorization failures without a valid UUID are not queued: " + String(invalidId), async () => {
    const f = await workerFixture();
    f.failAuthorization({ ok: false, status: 503 });
    await f.push(recoverablePayload({ data: { notificationId: invalidId } }));
    assertPrivateContentAbsent(f);
    assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
    await f.recover();
    assert.equal(f.authorizationRequests.length, 1);
  });
}

for (const rejectedUser of [null, "other-user"]) {
  test("recovery permanently drops notifications when authorization returns " + String(rejectedUser), async () => {
    const f = await workerFixture();
    f.failAuthorization({ ok: false, status: 503 });
    await f.push(recoverablePayload());
    f.authorizeAs(rejectedUser);
    await f.recover();
    const requestCount = f.authorizationRequests.length;
    assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
    f.authorizeAs(currentUserId);
    await f.recover();
    await f.push(recoverablePayload());
    assert.equal(f.authorizationRequests.length, requestCount);
    assertPrivateContentAbsent(f);
  });
}

test("a session-change message closes notifications and permanently removes pending recovery", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  await f.sessionChanged();
  assert.equal(f.closedNotifications.length, 1);
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
  f.authorizeAs(currentUserId);
  await f.recover();
  assert.equal(f.authorizationRequests.length, 1);
  assertPrivateContentAbsent(f);
});

test("a session change while recovery authorization waits prevents private redisplay", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  f.authorizeAs(currentUserId);
  const gate = f.deferNextAuthorization();
  const recovering = f.recover();
  await gate.started;
  const changed = f.sessionChanged();
  gate.release();
  await Promise.all([recovering, changed]);
  assertPrivateContentAbsent(f);
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
});

test("pending IDs survive worker restart and recover from server content without persisted bodies", async () => {
  const database = mockIndexedDB();
  const first = await workerFixture([], database);
  first.failAuthorization({ ok: false, status: 503 });
  await first.push(recoverablePayload());
  const restarted = await workerFixture([], database);
  await restarted.activate();
  assert.equal(restarted.shown.length, 1);
  assert.equal(restarted.shown[0].title, "Fresh server title");
  assert.equal(restarted.authorizationRequests[0].url, "/api/push/authorize?notificationId=" + notificationId);
});

test("a worker restart cannot reset the persisted recovery attempt budget", async () => {
  const database = mockIndexedDB();
  const first = await workerFixture([], database);
  first.failAuthorization({ ok: false, status: 503 });
  await first.push(recoverablePayload());
  await first.recover();
  const restarted = await workerFixture([], database);
  restarted.failAuthorization({ ok: false, status: 503 });
  await restarted.recover();
  assert.equal(restarted.authorizationRequests.length, 0);
  restarted.advance(61_000);
  await restarted.recover();
  assert.equal(database.snapshot().find(record => record.kind === "pending").attempts, 2);
  restarted.advance(3 * 60_000);
  await restarted.recover();
  assert.equal(restarted.authorizationRequests.length, 2);
  assert.equal(database.snapshot().filter(record => record.kind === "pending").length, 0);
});

test("successful display markers survive worker restart and prevent duplicate notifications", async () => {
  const database = mockIndexedDB();
  const first = await workerFixture([], database);
  await first.push(recoverablePayload());
  const restarted = await workerFixture([], database);
  await restarted.push(recoverablePayload());
  assert.equal(first.shown.length, 1);
  assert.equal(restarted.shown.length, 0);
  assert.equal(restarted.authorizationRequests.length, 0);
});

test("successful display markers are isolated by recipient", async () => {
  const f = await workerFixture();
  await f.push(recoverablePayload());
  await f.sessionChanged();
  f.authorizeAs("other-user");
  await f.push(recoverablePayload({ data: { recipientUserId: "other-user" } }));
  assert.equal(f.shown.length, 2);
  assert.equal(f.shown[1].options.data.recipientUserId, "other-user");
});

test("IndexedDB failure falls back to bounded in-memory recovery", async () => {
  const database = mockIndexedDB();
  database.fail();
  const f = await workerFixture([], database);
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  f.authorizeAs(currentUserId);
  await f.recover();
  assert.equal(f.shown.length, 2);
  assert.equal(f.shown[1].title, "Fresh server title");
  assert.deepEqual(database.snapshot(), []);
  await f.push(recoverablePayload());
  assert.equal(f.shown.length, 2);
});

test("existing visible notifications suppress duplicates across restart when IndexedDB is unavailable", async () => {
  const database = mockIndexedDB();
  database.fail();
  const first = await workerFixture([], database);
  await first.push(recoverablePayload());
  const restarted = await workerFixture([], database, first.activeNotifications);
  await restarted.push(recoverablePayload());
  assert.equal(first.shown.length, 1);
  assert.equal(restarted.shown.length, 0);
});

test("a temporary display failure uses the same bounded local recovery and current server content", async () => {
  const f = await workerFixture();
  f.failNextDisplay();
  await f.push(recoverablePayload());
  assertPrivateContentAbsent(f);
  assert.equal(f.database.snapshot().find(record => record.kind === "pending").attempts, 0);
  await f.recover();
  assert.equal(f.shown.at(-1).title, "Fresh server title");
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
});

for (const body of [false, true]) {
  test("the eight-second authorization timeout covers " + (body ? "a stalled response body" : "fetch"), async () => {
    const f = await workerFixture();
    const started = body ? f.hangAuthorizationBody() : f.hangAuthorization();
    const pending = f.push(recoverablePayload());
    await started;
    f.advanceTimers(8_000);
    await pending;
    assertPrivateContentAbsent(f);
    assert.equal(f.shown.at(-1).title, "소크나 알림 확인 지연");
    assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 1);
  });
}

for (const status of [400, 401, 403, 404, 410]) {
  test("authorization HTTP " + status + " permanently suppresses private content without fallback", async () => {
    const f = await workerFixture();
    f.failAuthorization({ ok: false, status });
    await f.push(recoverablePayload());
    assert.equal(f.shown.length, 0);
    assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
    f.authorizeAs(currentUserId);
    await f.push(recoverablePayload());
    assert.equal(f.shown.length, 0);
  });
}

test("expired incoming notifications are discarded before authorization", async () => {
  const f = await workerFixture();
  await f.push(recoverablePayload({ data: { expiresAt: String(f.now - 1) } }));
  assert.equal(f.shown.length, 0);
  assert.equal(f.authorizationRequests.length, 0);
});

test("a notification that expires during authorization cannot display late", async () => {
  const f = await workerFixture();
  const gate = f.deferNextAuthorization();
  const pending = f.push(recoverablePayload({ data: { expiresAt: String(f.now + 1000) } }));
  await gate.started;
  f.advance(2000);
  gate.release();
  await pending;
  assert.equal(f.shown.length, 0);
});

test("recovery drops a notification whose original expiry has elapsed", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload({ data: { expiresAt: String(f.now + 1000) } }));
  f.advance(1000);
  f.authorizeAs(currentUserId);
  await f.recover();
  assert.equal(f.authorizationRequests.length, 1);
  assertPrivateContentAbsent(f);
});

test("recovery cannot display after its fifteen-minute window expires during authorization", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  f.advance(15 * 60_000 - 1000);
  f.authorizeAs(currentUserId);
  const gate = f.deferNextAuthorization();
  const recovering = f.recover();
  await gate.started;
  f.advance(2000);
  gate.release();
  await recovering;
  assertPrivateContentAbsent(f);
  assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
  await f.push(recoverablePayload());
  assertPrivateContentAbsent(f);
  assert.equal(f.authorizationRequests.length, 2);
});

test("recovery responses must include the exact requested notification", async () => {
  for (const item of [null, { id: "other-id", title: "Wrong private title" }]) {
    const f = await workerFixture();
    f.failAuthorization({ ok: false, status: 503 });
    await f.push(recoverablePayload());
    f.authorizeAs(currentUserId);
    f.recoveryContent(item);
    await f.recover();
    assert.equal(f.shown.length, 1);
    assert.equal(f.database.snapshot().filter(record => record.kind === "pending").length, 0);
  }
});

test("background sync recovers deferred authorization without any display-ACK endpoint", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  f.authorizeAs(currentUserId);
  await f.sync();
  assert.equal(f.shown.length, 2);
  assert.ok(f.authorizationRequests.every(request => request.url.startsWith("/api/push/authorize")));
});

test("simultaneous copies of one push display once and create no server acknowledgement", async () => {
  const f = await workerFixture();
  await Promise.all([f.push(recoverablePayload()), f.push(recoverablePayload())]);
  assert.equal(f.shown.length, 1);
  assert.equal(f.authorizationRequests.length, 1);
});

test("the generic delayed notice opens only the public home without exposing a private target", async () => {
  const f = await workerFixture();
  f.failAuthorization({ ok: false, status: 503 });
  await f.push(recoverablePayload());
  await f.click(f.shown[0].options.data);
  assert.deepEqual(f.opened, [origin + "/"]);
  assert.equal(f.authorizationRequests.length, 1);
});
