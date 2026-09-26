import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSource(relativePath, mocks = {}, globals = {}) {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  const context = vm.createContext({
    exports: loadedModule.exports, module: loadedModule, URL, console,
    ...globals,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected test dependency: ${name}`);
    },
  });
  vm.runInContext(source, context, { filename });
  return loadedModule.exports;
}

const { createNotificationInbox, safeNotificationLink, notificationAtOrBeforeCutoff } = loadSource("components/notification-menu-state.ts");
const confirmedNavigation = loadSource("lib/confirmed-navigation.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const cutoff = "2026-09-27T01:00:00.000Z";
const readAt = "2026-09-27T01:01:00.000Z";
const item = (id, overrides = {}) => ({
  id, title: `Notification ${id}`, body: `Body ${id}`, link: `/members?notice=${id}`,
  created_at: "2026-09-27T00:00:00.000Z", read_at: null, ...overrides,
});
const response = (items, overrides = {}) => ({
  ok: true, userId: "user-a", items, unreadCount: items.filter((row) => !row.read_at).length,
  cutoff, nextCursor: null, ...overrides,
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(overrides = {}, unreadCount = 3) {
  const calls = [];
  const api = {
    list: async (input) => { calls.push(["list", input]); return response([item("1")]); },
    removeAll: async (...args) => { calls.push(["deleteAll", ...args]); return { ok: true, userId: "user-a", unreadCount: 0 }; },
    remove: async (...args) => { calls.push(["delete", ...args]); return { ok: true, userId: "user-a", unreadCount: 0 }; },
    markRead: async (...args) => { calls.push(["read", ...args]); return { ok: true, userId: "user-a", unreadCount: 0, readAt }; },
    markAllRead: async (...args) => { calls.push(["all", ...args]); return { ok: true, userId: "user-a", unreadCount: 0, readAt }; },
    ...overrides,
  };
  return { inbox: createNotificationInbox(api, "user-a", unreadCount), calls, api };
}

test("a server-rendered count stays available until the inbox loads", async () => {
  const pending = deferred();
  const { inbox } = fixture({ list: () => pending.promise }, 120);
  const request = inbox.refresh();
  assert.equal(inbox.getSnapshot().unreadCount, 120);
  assert.equal(inbox.getSnapshot().loading, true);
  pending.resolve(response([item("1")]));
  await request;
  assert.equal(inbox.getSnapshot().unreadCount, 1);
  assert.equal(inbox.getSnapshot().loading, false);
});

test("signing out immediately clears private content and ignores an older response", async () => {
  const pending = deferred();
  const { inbox, api } = fixture();
  await inbox.refresh();
  api.list = () => pending.promise;
  const request = inbox.refresh();
  inbox.setUser(null);
  assert.deepEqual(plain(inbox.getSnapshot().items), []);
  assert.equal(inbox.getSnapshot().unreadCount, null);
  pending.resolve(response([item("private-user-a")]));
  await request;
  assert.equal(inbox.getSnapshot().userId, null);
  assert.deepEqual(plain(inbox.getSnapshot().items), []);
});

test("a delayed response from A cannot replace B's notifications", async () => {
  const old = deferred();
  const { inbox, api } = fixture({ list: () => old.promise });
  const oldRequest = inbox.refresh();
  inbox.setUser("user-b");
  api.list = async (input) => {
    assert.equal(input.expectedUserId, "user-b");
    return response([item("b")], { userId: "user-b" });
  };
  await inbox.refresh();
  old.resolve(response([item("a-private")]));
  await oldRequest;
  assert.equal(inbox.getSnapshot().userId, "user-b");
  assert.deepEqual(inbox.getSnapshot().items.map((row) => row.id), ["b"]);
});

test("a mismatched response identity never exposes another account's items", async () => {
  const { inbox } = fixture({ list: async () => response([item("private-b")], { userId: "user-b" }) });
  await inbox.refresh();
  assert.deepEqual(plain(inbox.getSnapshot().items), []);
});

test("pagination retains the first cutoff and merges overlapping pages without duplicates", async () => {
  const cursor = { created_at: "2026-09-26T23:00:00.000Z", id: "2" };
  const { inbox, api } = fixture({ list: async () => response([item("1"), item("2")], { nextCursor: cursor }) });
  await inbox.refresh();
  api.list = async (input) => {
    assert.deepEqual(plain(input), { expectedUserId: "user-a", cursor, cutoff });
    return response([item("2"), item("3")], { unreadCount: 3 });
  };
  await inbox.loadMore();
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["1", "2", "3"]);
  assert.equal(inbox.getSnapshot().nextCursor, null);
});

test("failed pagination preserves existing rows and can be retried", async () => {
  const cursor = { created_at: cutoff, id: "1" };
  const { inbox, api } = fixture({ list: async () => response([item("1")], { nextCursor: cursor }) });
  await inbox.refresh();
  api.list = async () => { throw new Error("offline"); };
  await inbox.loadMore();
  assert.equal(inbox.getSnapshot().errorKind, "more");
  assert.ok(inbox.getSnapshot().error);
  assert.equal(inbox.getSnapshot().items.length, 1);
  api.list = async () => response([item("2")]);
  await inbox.loadMore();
  assert.equal(inbox.getSnapshot().items.length, 2);
  assert.equal(inbox.getSnapshot().error, null);
});

test("mark-all uses the displayed cutoff and leaves newer notifications unread", async () => {
  const pendingRead = deferred();
  const { inbox, api } = fixture();
  await inbox.refresh();
  api.markAllRead = (receivedCutoff, expectedUserId) => {
    assert.equal(receivedCutoff, cutoff);
    assert.equal(expectedUserId, "user-a");
    return pendingRead.promise;
  };
  const write = inbox.markAllRead();
  await Promise.resolve();
  api.list = async () => response([item("new", { created_at: "2026-09-27T01:00:30.000Z" }), item("1")], {
    cutoff: "2026-09-27T01:00:40.000Z", unreadCount: 2,
  });
  await inbox.refresh();
  pendingRead.resolve({ ok: true, userId: "user-a", unreadCount: 1, readAt });
  assert.equal(await write, true);
  assert.equal(inbox.getSnapshot().items[0].read_at, null);
  assert.equal(inbox.getSnapshot().items[1].read_at, readAt);
  assert.equal(inbox.getSnapshot().unreadCount, 1);
});

test("mark-all preserves a new notification one microsecond after its cutoff", async () => {
  const pendingRead = deferred();
  const preciseCutoff = "2026-09-27T01:00:00.000000Z";
  const { inbox, api } = fixture({ list: async () => response([item("equal", { created_at: preciseCutoff })], { cutoff: preciseCutoff }) });
  await inbox.refresh();
  api.markAllRead = () => pendingRead.promise;
  const write = inbox.markAllRead();
  await Promise.resolve();
  api.list = async () => response([
    item("new", { created_at: "2026-09-27T01:00:00.000001Z" }),
    item("equal", { created_at: preciseCutoff }),
    item("older", { created_at: "2026-09-27T00:59:59.999999Z" }),
  ], { cutoff: "2026-09-27T01:00:00.000002Z" });
  await inbox.refresh();
  pendingRead.resolve({ ok: true, userId: "user-a", unreadCount: 1, readAt });
  assert.equal(await write, true);
  assert.deepEqual(plain(inbox.getSnapshot().items.map(({ id, read_at }) => [id, read_at])), [
    ["new", null], ["equal", readAt], ["older", readAt],
  ]);
  assert.equal(inbox.getSnapshot().unreadCount, 1);
});

test("cutoff comparison retains microseconds across timestamp offsets and precision", () => {
  assert.equal(notificationAtOrBeforeCutoff("2026-09-27T10:00:00.123456+09:00", "2026-09-27T01:00:00.123456Z"), true);
  assert.equal(notificationAtOrBeforeCutoff("2026-09-27T10:00:00.123457+09:00", "2026-09-27T01:00:00.123456Z"), false);
  assert.equal(notificationAtOrBeforeCutoff("2026-09-27T01:00:00.123001+00:00", "2026-09-27T01:00:00.123Z"), false);
  assert.equal(notificationAtOrBeforeCutoff("invalid", cutoff), false);
});

test("a list fetched during a read mutation cannot restore stale unread state", async () => {
  const pendingRead = deferred();
  const pendingList = deferred();
  const { inbox, api } = fixture();
  await inbox.refresh();
  api.markRead = () => pendingRead.promise;
  const write = inbox.markRead("1");
  await Promise.resolve();
  api.list = () => pendingList.promise;
  const refresh = inbox.refresh();
  pendingRead.resolve({ ok: true, userId: "user-a", unreadCount: 0, readAt });
  await write;
  pendingList.resolve(response([item("1")]));
  await refresh;
  assert.equal(inbox.getSnapshot().items[0].read_at, readAt);
  assert.equal(inbox.getSnapshot().unreadCount, 0);
  assert.equal(inbox.getSnapshot().loading, false);
});

test("failed read writes preserve unread status and report an actionable error", async () => {
  const { inbox } = fixture({ markRead: async () => ({ ok: false, error: "읽음 표시를 저장하지 못했습니다." }) });
  await inbox.refresh();
  assert.equal(await inbox.markRead("1"), false);
  assert.equal(inbox.getSnapshot().items[0].read_at, null);
  assert.equal(inbox.getSnapshot().unreadCount, 1);
  assert.equal(inbox.getSnapshot().mutationKind, "single");
  assert.ok(inbox.getSnapshot().mutationError);
});

test("a completed read for A cannot update B's count or rows", async () => {
  const pendingRead = deferred();
  const { inbox, api } = fixture({ markRead: () => pendingRead.promise });
  await inbox.refresh();
  const write = inbox.markRead("1");
  await Promise.resolve();
  inbox.setUser("user-b", 5);
  api.list = async () => response([item("b")], { userId: "user-b", unreadCount: 5 });
  await inbox.refresh();
  pendingRead.resolve({ ok: true, userId: "user-a", unreadCount: 0, readAt });
  assert.equal(await write, false);
  assert.equal(inbox.getSnapshot().unreadCount, 5);
  assert.equal(inbox.getSnapshot().items[0].read_at, null);
});

test("read operations serialize so a late count cannot undo a newer count", async () => {
  const pendingRead = deferred();
  const writes = [];
  const { inbox } = fixture({ markRead: (id) => {
    writes.push(id);
    return id === "1" ? pendingRead.promise : Promise.resolve({ ok: true, userId: "user-a", unreadCount: 0, readAt });
  } });
  await inbox.refresh();
  const first = inbox.markRead("1");
  const second = inbox.markRead("2");
  await Promise.resolve();
  assert.deepEqual(writes, ["1"]);
  pendingRead.resolve({ ok: true, userId: "user-a", unreadCount: 1, readAt });
  await Promise.all([first, second]);
  assert.deepEqual(writes, ["1", "2"]);
  assert.equal(inbox.getSnapshot().unreadCount, 0);
});

test("unavailable counts stay unknown instead of being displayed as zero", async () => {
  const { inbox } = fixture({ list: async () => ({ ok: false, error: "잠시 후 다시 시도해 주세요." }) }, null);
  await inbox.refresh();
  assert.equal(inbox.getSnapshot().unreadCount, null);
  assert.ok(inbox.getSnapshot().error);
});

test("notification destinations allow only internal links", () => {
  for (const unsafe of [null, "", "//evil.example", "https://evil.example", "javascript:alert(1)", "/\\evil.example", "/\nevil.example"]) {
    assert.equal(safeNotificationLink(unsafe), "/");
  }
  assert.equal(safeNotificationLink("/gigs/42?tab=songs#latest"), "/gigs/42?tab=songs#latest");
});

test("the bell caps visual counts at 99+ while announcing the complete count", async () => {
  const jsxRuntime = await import("react/jsx-runtime");
  const fragment = ({ children }) => React.createElement(React.Fragment, null, children);
  const icon = () => React.createElement("svg", { "aria-hidden": true });
  const { NotificationMenu } = loadSource("components/notification-menu.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: ({ href, children }) => React.createElement("a", { href }, children), __esModule: true },
    "lucide-react": { Bell: icon, CheckCheck: icon, ChevronDown: icon, Loader2: icon, RefreshCw: icon, X: icon },
    "@/app/notifications/actions": { listNotificationsAction() {}, markAllNotificationsReadAction() {}, markNotificationReadAction() {}, deleteNotificationAction() {}, deleteAllNotificationsAction() {} },
    "@/lib/supabase/client": {},
    "@/lib/confirmed-navigation": confirmedNavigation,
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/components/ui/sonner": { toast: { error() {} } },
    "@/components/ui/dropdown-menu": {
      DropdownMenu: fragment, DropdownMenuTrigger: fragment, DropdownMenuContent: () => null,
      DropdownMenuItem: fragment, DropdownMenuLabel: fragment,
    },
    "./notification-menu-state": { createNotificationInbox, safeNotificationLink },
  });
  const html = renderToStaticMarkup(React.createElement(NotificationMenu, { userId: "user-a", initialUnreadCount: 120 }));
  assert.match(html, />99\+</);
  assert.match(html, /aria-label="알림, 읽지 않은 알림 120개"/);
  assert.match(html, /aria-live="polite"/);
});

test("the notification slot stays in the upper-right header on mobile rather than the bottom navigation", async () => {
  const jsxRuntime = await import("react/jsx-runtime");
  const icon = () => React.createElement("svg", { "aria-hidden": true });
  const { SiteHeaderClient } = loadSource("components/site-header-client.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children), __esModule: true },
    "next/image": { default: () => React.createElement("img", { alt: "소크나" }), __esModule: true },
    "next/navigation": { usePathname: () => "/" },
    "lucide-react": { CalendarDays: icon, House: icon, UserRound: icon },
    "@/lib/club": { CLUB_NAME_KOREAN: "소크나" },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  });
  const html = renderToStaticMarkup(React.createElement(SiteHeaderClient, {
    authButton: React.createElement("button", { "aria-label": "notification-slot" }),
  }));
  const [header, afterHeader] = html.split("</header>");
  assert.match(header, /class="shrink-0"><button aria-label="notification-slot"/);
  assert.doesNotMatch(afterHeader, /notification-slot/);
  assert.match(afterHeader, /aria-label="모바일 주요 메뉴"/);
});

test("a service-worker notification refreshes the unread badge and unmount removes its listener", async () => {
  const jsxRuntime = await import("react/jsx-runtime");
  const effects = [];
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      dispatch(type, event) { for (const callback of listeners.get(type) ?? []) callback(event); },
    };
  };
  const serviceWorker = target();
  let inbox;
  let requests = 0;
  let unsubscribed = false;
  const { NotificationMenu } = loadSource("components/notification-menu.tsx", {
    react: {
      ...React,
      useEffect: (callback) => effects.push(callback),
      useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
      useId: () => "test-menu",
    },
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: () => null, __esModule: true },
    "lucide-react": {},
    "@/app/notifications/actions": {
      listNotificationsAction: async () => { requests++; return response([], { unreadCount: requests === 1 ? 0 : 7 }); },
      markAllNotificationsReadAction() {}, markNotificationReadAction() {}, deleteNotificationAction() {}, deleteAllNotificationsAction() {},
    },
    "@/lib/supabase/client": { createClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }) } }) },
    "@/lib/confirmed-navigation": confirmedNavigation,
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/components/ui/sonner": { toast: { error() {} } },
    "@/components/ui/dropdown-menu": {},
    "./notification-menu-state": {
      safeNotificationLink,
      createNotificationInbox: (...args) => { inbox = createNotificationInbox(...args); return inbox; },
    },
  }, { window: target(), document: { ...target(), visibilityState: "visible" }, navigator: { serviceWorker } });
  NotificationMenu({ userId: "user-a", initialUnreadCount: 0 });
  const cleanup = effects[0]();
  await Promise.resolve();
  assert.equal(requests, 1);
  serviceWorker.dispatch("message", { data: { type: "unrelated-message" } });
  assert.equal(requests, 1);
  const updated = new Promise((resolve) => {
    const unsubscribe = inbox.subscribe(() => {
      if (inbox.getSnapshot().unreadCount === 7) { unsubscribe(); resolve(); }
    });
  });
  serviceWorker.dispatch("message", { data: { type: "SOKNA_NOTIFICATIONS_CHANGED" } });
  await updated;
  assert.equal(requests, 2);
  assert.equal(inbox.getSnapshot().unreadCount, 7);
  cleanup();
  serviceWorker.dispatch("message", { data: { type: "SOKNA_NOTIFICATIONS_CHANGED" } });
  assert.equal(requests, 2);
  assert.equal(unsubscribed, true);
});

function hookRuntime() {
  const slots = [];
  const effects = [];
  const cleanups = [];
  let cursor = 0;
  return {
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useEffect(callback) {
        const index = cursor++;
        if (!(index in slots)) { slots[index] = true; effects.push(callback); }
      },
      useId: () => 'inbox-test',
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    },
    render(callback) {
      cursor = 0;
      const result = callback();
      while (effects.length) cleanups.push(effects.shift()());
      return result;
    },
    cleanup() { for (const cleanup of cleanups) cleanup?.(); },
  };
}

function eventSurface() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) ?? []) callback(event);
      return !event.defaultPrevented;
    },
  };
}

test('confirmed guarded notification navigation marks read after approval, even when the link disappears', async () => {
  const jsxRuntime = await import('react/jsx-runtime');
  for (const outcome of ['confirm', 'cancel', 'account-change']) {
    const window = { ...eventSurface(), location: { href: 'https://sokna.test/profile', origin: 'https://sokna.test' } };
    class LinkElement {
      href = 'https://sokna.test/members';
      dataset = { notificationId: '1', notificationUserId: 'user-a' };
      target = '';
      closest() { return this; }
      getAttribute() { return '/members'; }
      hasAttribute() { return false; }
    }
    class CustomEvent {
      constructor(type, { detail }) { this.type = type; this.detail = detail; }
    }
    const navigation = loadSource('lib/confirmed-navigation.ts', {}, { window, CustomEvent });
    const guardHooks = hookRuntime();
    const routes = [];
    const { useUnsavedChangesWarning } = loadSource('components/ui/leave-confirm-dialog.tsx', {
      react: guardHooks.react,
      'react/jsx-runtime': jsxRuntime,
      'next/navigation': { useRouter: () => ({ push: (href) => routes.push(href), back() {} }) },
      'lucide-react': {},
      '@/components/ui/button': {},
      '@/lib/confirmed-navigation': navigation,
    }, { window, Element: LinkElement });
    const renderGuard = () => guardHooks.render(() => useUnsavedChangesWarning({ isDirty: true }));
    renderGuard();

    const menuHooks = hookRuntime();
    const reads = [];
    let onAuthChange;
    const { NotificationMenu } = loadSource('components/notification-menu.tsx', {
      react: menuHooks.react,
      'react/jsx-runtime': jsxRuntime,
      'next/link': { default: () => null, __esModule: true },
      'lucide-react': {},
      '@/app/notifications/actions': {
        listNotificationsAction: async () => response([item('1')]),
        markNotificationReadAction: async (...args) => {
          reads.push(args);
          return { ok: true, userId: 'user-a', unreadCount: 0, readAt };
        },
        markAllNotificationsReadAction() {}, deleteNotificationAction() {}, deleteAllNotificationsAction() {},
      },
      '@/lib/supabase/client': { createClient: () => ({ auth: { onAuthStateChange: (callback) => {
        onAuthChange = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      } } }) },
      '@/lib/confirmed-navigation': navigation,
      '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
      '@/components/ui/sonner': { toast: { error() {} } },
      '@/components/ui/dropdown-menu': {},
      './notification-menu-state': { createNotificationInbox, safeNotificationLink },
    }, { window, document: { ...eventSurface(), visibilityState: 'visible' }, navigator: {} });
    menuHooks.render(() => NotificationMenu({ userId: 'user-a', initialUnreadCount: 1 }));
    await new Promise(setImmediate);

    const link = new LinkElement();
    const click = { type: 'click', target: link, button: 0,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; } };
    window.dispatchEvent(click);
    const guard = renderGuard();
    assert.equal(guard.showLeaveModal, true, outcome);
    assert.equal(click.defaultPrevented, true, outcome);
    assert.equal(click.stopped, true, outcome);
    assert.equal(reads.length, 0, outcome);
    // Closing the popover can remove or change the original anchor before approval.
    link.dataset = {};
    link.href = 'https://sokna.test/';
    if (outcome === 'account-change') onAuthChange('SIGNED_IN', { user: { id: 'user-b' } });
    if (outcome === 'cancel') guard.cancelLeave();
    else guard.confirmLeave();
    await new Promise(setImmediate);
    assert.deepEqual(reads, outcome === 'confirm' ? [['1', 'user-a']] : [], outcome);
    assert.deepEqual(routes, outcome === 'cancel' ? [] : ['/members'], outcome);
    guardHooks.cleanup();
    menuHooks.cleanup();
  }
});

test("deleting one notification uses the server total and preserves the remaining page and cursor", async () => {
  const pendingDelete = deferred();
  const cursor = { created_at: cutoff, id: "2" };
  const { inbox, calls } = fixture({
    list: async () => response([item("1"), item("2")], { unreadCount: 80, nextCursor: cursor }),
    remove: (...args) => { calls.push(["delete", ...args]); return pendingDelete.promise; },
  });
  await inbox.refresh();
  const write = inbox.remove("2");
  await Promise.resolve();
  assert.equal(inbox.getSnapshot().deletingId, "2");
  assert.equal(inbox.getSnapshot().mutationKind, "delete");
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["1", "2"]);
  pendingDelete.resolve({ ok: true, userId: "user-a", unreadCount: 79 });
  assert.equal(await write, true);
  assert.deepEqual(calls, [["delete", "2", "user-a"]]);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["1"]);
  assert.equal(inbox.getSnapshot().items[0].read_at, null);
  assert.equal(inbox.getSnapshot().unreadCount, 79);
  assert.deepEqual(plain(inbox.getSnapshot().nextCursor), cursor);
  assert.equal(inbox.getSnapshot().cutoff, cutoff);
  assert.equal(inbox.getSnapshot().deletingId, null);
  assert.equal(inbox.getSnapshot().mutationKind, null);
});

test("delete failures preserve content and count, expose a retryable error, and recover on retry", async () => {
  for (const failedRemove of [
    async () => ({ ok: false, error: "삭제를 저장하지 못했습니다." }),
    async () => { throw new Error("network offline"); },
  ]) {
    const { inbox, api } = fixture({ remove: failedRemove });
    await inbox.refresh();
    assert.equal(await inbox.remove("1"), false);
    assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["1"]);
    assert.equal(inbox.getSnapshot().unreadCount, 1);
    assert.equal(inbox.getSnapshot().deletingId, null);
    assert.equal(inbox.getSnapshot().mutationKind, "delete");
    assert.ok(inbox.getSnapshot().mutationError);
    const retry = deferred();
    api.remove = () => retry.promise;
    const retryWrite = inbox.remove("1");
    await Promise.resolve();
    assert.equal(inbox.getSnapshot().mutationError, null);
    assert.equal(inbox.getSnapshot().deletingId, "1");
    retry.resolve({ ok: true, userId: "user-a", unreadCount: 0 });
    assert.equal(await retryWrite, true);
    assert.deepEqual(plain(inbox.getSnapshot().items), []);
    assert.equal(inbox.getSnapshot().unreadCount, 0);
    assert.equal(inbox.getSnapshot().mutationError, null);
  }
});

test("list responses started before or during deletion cannot resurrect the removed notification", async () => {
  for (const timing of ["before", "during"]) {
    const pendingDelete = deferred();
    const pendingList = deferred();
    const { inbox, api } = fixture({ remove: () => pendingDelete.promise });
    await inbox.refresh();
    api.list = () => pendingList.promise;
    const refreshBefore = timing === "before" ? inbox.refresh() : null;
    const write = inbox.remove("1");
    await Promise.resolve();
    const refresh = refreshBefore ?? inbox.refresh();
    pendingDelete.resolve({ ok: true, userId: "user-a", unreadCount: 0 });
    assert.equal(await write, true);
    pendingList.resolve(response([item("1")]));
    await refresh;
    assert.deepEqual(plain(inbox.getSnapshot().items), [], timing);
    assert.equal(inbox.getSnapshot().unreadCount, 0, timing);
    assert.equal(inbox.getSnapshot().loading, false, timing);
  }
});

test("an older pagination request cannot restore a deleted row or overwrite its server count", async () => {
  const pendingPage = deferred();
  const cursor = { created_at: cutoff, id: "1" };
  const { inbox, api } = fixture({
    list: async () => response([item("1")], { unreadCount: 9, nextCursor: cursor }),
    remove: async () => ({ ok: true, userId: "user-a", unreadCount: 8 }),
  });
  await inbox.refresh();
  api.list = () => pendingPage.promise;
  const more = inbox.loadMore();
  assert.equal(await inbox.remove("1"), true);
  pendingPage.resolve(response([item("1"), item("2")], { unreadCount: 9 }));
  await more;
  assert.deepEqual(plain(inbox.getSnapshot().items), []);
  assert.equal(inbox.getSnapshot().unreadCount, 8);
  assert.equal(inbox.getSnapshot().loadingMore, false);
  assert.deepEqual(plain(inbox.getSnapshot().nextCursor), cursor);
  api.list = async (input) => {
    assert.deepEqual(plain(input), { expectedUserId: "user-a", cursor, cutoff });
    return response([item("2")], { unreadCount: 8 });
  };
  await inbox.loadMore();
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["2"]);
});

test("account changes discard active and queued deletes while the new account can write immediately", async () => {
  const pendingA = deferred();
  const pendingB = deferred();
  const removals = [];
  const { inbox, api } = fixture({
    list: async () => response([item("shared-id"), item("queued-a")], { unreadCount: 2 }),
    remove: (id, owner) => {
      removals.push([id, owner]);
      return owner === "user-a" ? pendingA.promise : pendingB.promise;
    },
  });
  await inbox.refresh();
  const activeA = inbox.remove("shared-id");
  const queuedA = inbox.remove("queued-a");
  await Promise.resolve();
  assert.deepEqual(removals, [["shared-id", "user-a"]]);
  inbox.setUser("user-b", 5);
  assert.equal(inbox.getSnapshot().deletingId, null);
  api.list = async () => response([item("shared-id"), item("b")], { userId: "user-b", unreadCount: 5 });
  await inbox.refresh();
  const activeB = inbox.remove("b");
  await Promise.resolve();
  assert.deepEqual(removals, [["shared-id", "user-a"], ["b", "user-b"]]);
  pendingA.resolve({ ok: true, userId: "user-a", unreadCount: 0 });
  assert.equal(await activeA, false);
  assert.equal(await queuedA, false);
  assert.equal(inbox.getSnapshot().deletingId, "b");
  assert.equal(inbox.getSnapshot().unreadCount, 5);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["shared-id", "b"]);
  pendingB.resolve({ ok: true, userId: "user-b", unreadCount: 4 });
  assert.equal(await activeB, true);
  assert.equal(inbox.getSnapshot().userId, "user-b");
  assert.equal(inbox.getSnapshot().unreadCount, 4);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["shared-id"]);
  assert.deepEqual(removals, [["shared-id", "user-a"], ["b", "user-b"]]);
});

test("a mismatched deletion response clears private account state instead of removing another account's row", async () => {
  const { inbox } = fixture({ remove: async () => ({ ok: true, userId: "user-b", unreadCount: 0 }) });
  await inbox.refresh();
  assert.equal(await inbox.remove("1"), false);
  assert.equal(inbox.getSnapshot().userId, null);
  assert.equal(inbox.getSnapshot().unreadCount, null);
  assert.deepEqual(plain(inbox.getSnapshot().items), []);
});

test("read, delete, and mark-all writes share one ordered queue", async () => {
  const read = deferred();
  const remove = deferred();
  const all = deferred();
  const operations = [];
  const { inbox } = fixture({
    list: async () => response([item("1"), item("2")], { unreadCount: 12 }),
    markRead: (id, owner) => { operations.push(["read", id, owner]); return read.promise; },
    remove: (id, owner) => { operations.push(["delete", id, owner]); return remove.promise; },
    markAllRead: (at, owner) => { operations.push(["all", at, owner]); return all.promise; },
  });
  await inbox.refresh();
  const readWrite = inbox.markRead("1");
  const deleteWrite = inbox.remove("1");
  const allWrite = inbox.markAllRead();
  await Promise.resolve();
  assert.deepEqual(operations, [["read", "1", "user-a"]]);
  read.resolve({ ok: true, userId: "user-a", unreadCount: 11, readAt });
  assert.equal(await readWrite, true);
  await new Promise(setImmediate);
  assert.deepEqual(operations, [["read", "1", "user-a"], ["delete", "1", "user-a"]]);
  assert.equal(inbox.getSnapshot().items[0].read_at, readAt);
  assert.equal(inbox.getSnapshot().deletingId, "1");
  remove.resolve({ ok: true, userId: "user-a", unreadCount: 11 });
  assert.equal(await deleteWrite, true);
  await new Promise(setImmediate);
  assert.deepEqual(operations, [["read", "1", "user-a"], ["delete", "1", "user-a"], ["all", cutoff, "user-a"]]);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["2"]);
  all.resolve({ ok: true, userId: "user-a", unreadCount: 0, readAt });
  assert.equal(await allWrite, true);
  assert.equal(inbox.getSnapshot().unreadCount, 0);
  assert.equal(inbox.getSnapshot().items[0].read_at, readAt);
  assert.equal(inbox.getSnapshot().deletingId, null);
  assert.equal(inbox.getSnapshot().markingAll, false);
});

test("the delete menu item keeps the popup open, stays separate from navigation, and leaves pagination available", async () => {
  const jsxRuntime = await import("react/jsx-runtime");
  for (const failFirst of [false, true]) {
    const hooks = hookRuntime();
    const deletions = [];
    const reads = [];
    const toasts = [];
    const pending = [deferred(), deferred()];
    const cursor = { created_at: cutoff, id: "1" };
    const Link = () => null;
    const icons = Object.fromEntries(["Bell", "CheckCheck", "ChevronDown", "Loader2", "RefreshCw", "X"]
      .map((name) => [name, () => null]));
    const dropdowns = Object.fromEntries([
      "DropdownMenu", "DropdownMenuTrigger", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuLabel",
    ].map((name) => [name, () => null]));
    const { NotificationMenu } = loadSource("components/notification-menu.tsx", {
      react: hooks.react,
      "react/jsx-runtime": jsxRuntime,
      "next/link": { default: Link, __esModule: true },
      "lucide-react": icons,
      "@/app/notifications/actions": {
        listNotificationsAction: async () => response([item("1")], { unreadCount: 9, nextCursor: cursor }),
        deleteAllNotificationsAction() {},
        deleteNotificationAction: (...args) => {
          deletions.push(args);
          return pending[deletions.length - 1].promise;
        },
        markNotificationReadAction: (...args) => {
          reads.push(args);
          return Promise.resolve({ ok: true, userId: "user-a", unreadCount: 8, readAt });
        },
        markAllNotificationsReadAction: (...args) => {
          reads.push(args);
          return Promise.resolve({ ok: true, userId: "user-a", unreadCount: 0, readAt });
        },
      },
      "@/lib/supabase/client": { createClient: () => ({ auth: { onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }) } }) },
      "@/lib/confirmed-navigation": confirmedNavigation,
      "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
      "@/components/ui/sonner": { toast: { error: (message) => toasts.push(message) } },
      "@/components/ui/dropdown-menu": dropdowns,
      "./notification-menu-state": { createNotificationInbox, safeNotificationLink },
    }, {
      window: eventSurface(), document: { ...eventSurface(), visibilityState: "visible" }, navigator: {},
    });
    const render = () => hooks.render(() => NotificationMenu({ userId: "user-a", initialUnreadCount: 9 }));
    let tree = render();
    await new Promise(setImmediate);
    tree.props.onOpenChange(true);
    await new Promise(setImmediate);
    tree = render();
    const nodes = (rootNode) => {
      const all = [];
      function walk(node, parents = []) {
        if (Array.isArray(node)) { node.forEach((child) => walk(child, parents)); return; }
        if (!node || typeof node !== "object" || !node.props) return;
        all.push({ node, parents });
        walk(node.props.children, [...parents, node]);
      }
      walk(rootNode);
      return all;
    };
    const deleteButton = () => nodes(tree).find(({ node }) =>
      node.type === "button" && node.props["aria-label"] === "Notification 1 삭제");
    const button = deleteButton();
    assert.ok(button);
    assert.equal(tree.props.open, true);
    assert.equal(button.parents.at(-1).type, dropdowns.DropdownMenuItem);
    assert.equal(button.parents.some((parent) => parent.type === Link), false);
    const link = nodes(tree).find(({ node }) => node.type === Link && node.props["data-notification-id"] === "1");
    assert.ok(link);
    assert.equal(link.parents.at(-2), button.parents.at(-2), "link and delete control must be sibling menu items");
    assert.equal(button.node.props.onClick, undefined);

    for (let attempt = 0; attempt < (failFirst ? 2 : 1); attempt++) {
      const currentButton = deleteButton();
      const selection = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      currentButton.parents.at(-1).props.onSelect(selection);
      assert.equal(selection.defaultPrevented, true, "prevent Radix selection from closing the popup");
      await Promise.resolve();
      tree = render();
      const busy = deleteButton();
      assert.equal(tree.props.open, true);
      assert.equal(busy.node.props.disabled, true);
      assert.equal(busy.parents.at(-1).props.disabled, true);
      assert.ok(nodes(busy.node).some(({ node }) => node.type === icons.Loader2));
      assert.deepEqual(reads, []);
      if (failFirst && attempt === 0) {
        pending[attempt].resolve({ ok: false, error: "삭제를 저장하지 못했습니다." });
        await new Promise(setImmediate);
        tree = render();
        assert.equal(tree.props.open, true);
        assert.equal(deleteButton().node.props.disabled, false);
        assert.deepEqual(toasts, ["삭제를 저장하지 못했습니다."]);
      } else {
        pending[attempt].resolve({ ok: true, userId: "user-a", unreadCount: 8 });
        await new Promise(setImmediate);
        tree = render();
      }
    }

    assert.deepEqual(deletions, failFirst ? [["1", "user-a"], ["1", "user-a"]] : [["1", "user-a"]]);
    assert.equal(tree.props.open, true);
    assert.equal(deleteButton(), undefined);
    assert.deepEqual(reads, []);
    assert.ok(nodes(tree).some(({ node }) => node.type === "button" && node.props["aria-label"] === "알림, 읽지 않은 알림 8개"));
    const text = [];
    const collectText = (value) => {
      if (typeof value === "string") text.push(value);
      else if (Array.isArray(value)) value.forEach(collectText);
      else if (value?.props) collectText(value.props.children);
    };
    collectText(tree);
    assert.ok(text.includes("이전 알림 더 보기"), "deleting the loaded page must preserve access to older notifications");
    assert.equal(text.includes("아직 도착한 알림이 없습니다."), false);
    hooks.cleanup();
  }
});

test("bulk deletion scopes the full account by cutoff rather than the loaded twenty IDs", async () => {
  let stored = Array.from({ length: 35 }, (_, index) => item(String(index), { read_at: index % 2 ? readAt : null }));
  stored.push(item("new-server-only", { created_at: "2026-09-27T01:00:01.000Z" }));
  const writes = [];
  const { inbox, api } = fixture({
    list: async () => response(stored.slice(0, 20), { unreadCount: 19, nextCursor: { created_at: cutoff, id: "19" } }),
    removeAll: async (...args) => {
      writes.push(args);
      stored = stored.filter((row) => !notificationAtOrBeforeCutoff(row.created_at, args[0]));
      return { ok: true, userId: args[1], unreadCount: stored.filter((row) => !row.read_at).length };
    },
  });
  assert.equal(await inbox.removeAll(), false, "no cutoff means no bulk request");
  await inbox.refresh();
  api.list = async () => ({ ok: false, error: "이전 페이지 조회 실패" });
  await inbox.loadMore();
  assert.ok(inbox.getSnapshot().error);
  assert.equal(await inbox.removeAll(), true);
  assert.deepEqual(writes, [[cutoff, "user-a"]]);
  assert.deepEqual(stored.map((row) => row.id), ["new-server-only"]);
  assert.deepEqual(plain(inbox.getSnapshot().items), []);
  assert.equal(inbox.getSnapshot().unreadCount, 1, "server total includes unread arrivals outside the displayed page");
  assert.equal(inbox.getSnapshot().nextCursor, null);
  assert.equal(inbox.getSnapshot().error, null);
  assert.equal(inbox.getSnapshot().deletingAll, false);
  assert.equal(inbox.getSnapshot().mutationKind, null);
  inbox.setUser(null);
  assert.equal(await inbox.removeAll(), false);
  assert.equal(writes.length, 1);
});

test("bulk deletion preserves arrivals and refreshed pagination one microsecond after its captured cutoff", async () => {
  const preciseCutoff = "2026-09-27T01:00:00.000000Z";
  const newAt = "2026-09-27T10:00:00.000001+09:00";
  const newerCursor = { created_at: newAt, id: "new" };
  const pending = deferred();
  const { inbox, api } = fixture({
    list: async () => response([item("equal", { created_at: preciseCutoff }), item("read-old", { read_at: readAt })], {
      cutoff: preciseCutoff, nextCursor: { created_at: preciseCutoff, id: "equal" },
    }),
    removeAll: (at, owner) => {
      assert.equal(at, preciseCutoff);
      assert.equal(owner, "user-a");
      return pending.promise;
    },
  });
  await inbox.refresh();
  const write = inbox.removeAll();
  await Promise.resolve();
  assert.equal(inbox.getSnapshot().deletingAll, true);
  api.list = async () => response([
    item("new", { created_at: newAt }), item("equal", { created_at: preciseCutoff }), item("read-old", { read_at: readAt }),
  ], { cutoff: "2026-09-27T01:00:02.000Z", nextCursor: newerCursor });
  await inbox.refresh();
  pending.resolve({ ok: true, userId: "user-a", unreadCount: 6 });
  assert.equal(await write, true);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["new"]);
  assert.deepEqual(plain(inbox.getSnapshot().nextCursor), newerCursor);
  assert.equal(inbox.getSnapshot().unreadCount, 6);
  assert.equal(inbox.getSnapshot().cutoff, "2026-09-27T01:00:02.000Z");
});

test("failed bulk deletion retries its original cutoff after refresh, then releases it after success", async () => {
  for (const failure of [
    async () => ({ ok: false, error: "전체 삭제 실패" }),
    async () => { throw new Error("offline"); },
  ]) {
    const writes = [];
    const refreshedCutoff = "2026-09-27T01:02:00.000Z";
    const { inbox, api } = fixture({ removeAll: failure });
    await inbox.refresh();
    assert.equal(await inbox.removeAll(), false);
    assert.equal(inbox.getSnapshot().mutationKind, "deleteAll");
    assert.ok(inbox.getSnapshot().mutationError);
    assert.equal(inbox.getSnapshot().deletingAll, false);
    assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["1"]);
    api.list = async () => response([item("new", { created_at: "2026-09-27T01:01:00.000Z" }), item("1")], { cutoff: refreshedCutoff });
    await inbox.refresh();
    api.removeAll = async (at, owner) => {
      writes.push([at, owner]);
      return { ok: true, userId: owner, unreadCount: at === cutoff ? 1 : 0 };
    };
    assert.equal(await inbox.removeAll(), true);
    assert.deepEqual(writes, [[cutoff, "user-a"]]);
    assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["new"]);
    assert.equal(inbox.getSnapshot().mutationError, null);
    assert.equal(await inbox.removeAll(), true);
    assert.deepEqual(writes, [[cutoff, "user-a"], [refreshedCutoff, "user-a"]]);
    assert.deepEqual(plain(inbox.getSnapshot().items), []);
  }
});

test("a committed bulk delete followed by a count failure cannot delete later arrivals on retry", async () => {
  let stored = [item("old")];
  let countFails = true;
  const writes = [];
  let listCutoff = cutoff;
  const { inbox } = fixture({
    list: async () => response([...stored], { cutoff: listCutoff }),
    removeAll: async (at, owner) => {
      writes.push([at, owner]);
      stored = stored.filter((row) => !notificationAtOrBeforeCutoff(row.created_at, at));
      return countFails ? { ok: false, error: "미확인 개수를 확인하지 못했습니다." }
        : { ok: true, userId: owner, unreadCount: stored.length };
    },
  });
  await inbox.refresh();
  assert.equal(await inbox.removeAll(), false);
  assert.equal(stored.length, 0);
  stored.push(item("arrived-after-commit", { created_at: "2026-09-27T01:01:00.000Z" }));
  listCutoff = "2026-09-27T01:02:00.000Z";
  await inbox.refresh();
  countFails = false;
  assert.equal(await inbox.removeAll(), true);
  assert.deepEqual(writes, [[cutoff, "user-a"], [cutoff, "user-a"]]);
  assert.deepEqual(stored.map((row) => row.id), ["arrived-after-commit"]);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["arrived-after-commit"]);
  assert.equal(inbox.getSnapshot().unreadCount, 1);
});

test("list requests begun before or during bulk deletion cannot restore rows or old cursors", async () => {
  for (const timing of ["before", "during"]) {
    const pendingDelete = deferred();
    const pendingList = deferred();
    const oldCursor = { created_at: cutoff, id: "1" };
    const { inbox, api } = fixture({
      list: async () => response([item("1")], { nextCursor: oldCursor }),
      removeAll: () => pendingDelete.promise,
    });
    await inbox.refresh();
    api.list = () => pendingList.promise;
    const before = timing === "before" ? inbox.refresh() : null;
    const write = inbox.removeAll();
    await Promise.resolve();
    const refresh = before ?? inbox.refresh();
    pendingDelete.resolve({ ok: true, userId: "user-a", unreadCount: 0 });
    assert.equal(await write, true);
    pendingList.resolve(response([item("1")], { nextCursor: oldCursor }));
    await refresh;
    assert.deepEqual(plain(inbox.getSnapshot().items), [], timing);
    assert.equal(inbox.getSnapshot().unreadCount, 0, timing);
    assert.equal(inbox.getSnapshot().nextCursor, null, timing);
    assert.equal(inbox.getSnapshot().loading, false, timing);
  }
});

test("account changes discard active and queued bulk deletes and reset the retained retry boundary", async () => {
  const pendingA = deferred();
  const pendingB = deferred();
  const writes = [];
  const cutoffB = "2026-09-27T02:00:00.000Z";
  const { inbox, api } = fixture({ removeAll: (at, owner) => {
    writes.push([at, owner]);
    return owner === "user-a" ? pendingA.promise : pendingB.promise;
  } });
  await inbox.refresh();
  const activeA = inbox.removeAll();
  const queuedA = inbox.removeAll();
  await Promise.resolve();
  inbox.setUser("user-b", 5);
  assert.equal(inbox.getSnapshot().deletingAll, false);
  api.list = async () => response([item("b")], { userId: "user-b", cutoff: cutoffB, unreadCount: 5 });
  await inbox.refresh();
  const activeB = inbox.removeAll();
  await Promise.resolve();
  assert.deepEqual(writes, [[cutoff, "user-a"], [cutoffB, "user-b"]]);
  pendingA.resolve({ ok: false, error: "Old account failure" });
  assert.equal(await activeA, false);
  assert.equal(await queuedA, false);
  assert.equal(inbox.getSnapshot().deletingAll, true);
  assert.equal(inbox.getSnapshot().mutationError, null);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["b"]);
  pendingB.resolve({ ok: true, userId: "user-b", unreadCount: 0 });
  assert.equal(await activeB, true);
  assert.deepEqual(writes, [[cutoff, "user-a"], [cutoffB, "user-b"]]);
  assert.deepEqual(plain(inbox.getSnapshot().items), []);
});

test("bulk delete captures its cutoff while queued behind a read and serializes following individual deletes", async () => {
  const pendingRead = deferred();
  const pendingBulk = deferred();
  const operations = [];
  const { inbox, api } = fixture({
    markRead: (id, owner) => { operations.push(["read", id, owner]); return pendingRead.promise; },
    removeAll: (at, owner) => { operations.push(["bulk", at, owner]); return pendingBulk.promise; },
    remove: async (id, owner) => { operations.push(["delete", id, owner]); return { ok: true, userId: owner, unreadCount: 1 }; },
  });
  await inbox.refresh();
  const read = inbox.markRead("1");
  const bulk = inbox.removeAll();
  const single = inbox.remove("already-deleted");
  await Promise.resolve();
  api.list = async () => response([item("new", { created_at: "2026-09-27T01:01:00.000Z" }), item("1")], {
    cutoff: "2026-09-27T01:02:00.000Z", unreadCount: 2,
  });
  await inbox.refresh();
  assert.deepEqual(operations, [["read", "1", "user-a"]]);
  pendingRead.resolve({ ok: true, userId: "user-a", unreadCount: 1, readAt });
  assert.equal(await read, true);
  await new Promise(setImmediate);
  assert.deepEqual(operations, [["read", "1", "user-a"], ["bulk", cutoff, "user-a"]]);
  assert.equal(inbox.getSnapshot().deletingAll, true);
  pendingBulk.resolve({ ok: true, userId: "user-a", unreadCount: 1 });
  assert.equal(await bulk, true);
  assert.equal(await single, true);
  assert.deepEqual(operations, [["read", "1", "user-a"], ["bulk", cutoff, "user-a"], ["delete", "already-deleted", "user-a"]]);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["new"]);
  assert.equal(inbox.getSnapshot().unreadCount, 1);
  assert.equal(inbox.getSnapshot().deletingAll, false);
});

test("a second queued bulk delete restores its retry cutoff after the first one succeeds", async () => {
  const firstReply = deferred();
  const secondReply = deferred();
  const cutoffs = [];
  const { inbox, api } = fixture({ removeAll: (at) => {
    cutoffs.push(at);
    return cutoffs.length === 1 ? firstReply.promise : cutoffs.length === 2 ? secondReply.promise
      : Promise.resolve({ ok: true, userId: "user-a", unreadCount: 1 });
  } });
  await inbox.refresh();
  const first = inbox.removeAll();
  const second = inbox.removeAll();
  await Promise.resolve();
  firstReply.resolve({ ok: true, userId: "user-a", unreadCount: 0 });
  assert.equal(await first, true);
  await new Promise(setImmediate);
  api.list = async () => response([item("new", { created_at: "2026-09-27T01:01:00.000Z" })], {
    cutoff: "2026-09-27T01:02:00.000Z",
  });
  await inbox.refresh();
  secondReply.resolve({ ok: false, error: "두 번째 요청 응답 실패" });
  assert.equal(await second, false);
  assert.equal(await inbox.removeAll(), true);
  assert.deepEqual(cutoffs, [cutoff, cutoff, cutoff]);
  assert.deepEqual(plain(inbox.getSnapshot().items.map((row) => row.id)), ["new"]);
});

test("the bulk-delete header works with a fully read inbox, keeps the popup open, and retries its saved cutoff", async () => {
  const jsxRuntime = await import("react/jsx-runtime");
  for (const failFirst of [false, true]) {
    const hooks = hookRuntime();
    const window = eventSurface();
    const pending = [deferred(), deferred()];
    const deletes = [];
    const unrelatedWrites = [];
    let listCutoff = cutoff;
    const Link = () => null;
    const icons = Object.fromEntries(["Bell", "CheckCheck", "ChevronDown", "Loader2", "RefreshCw", "X"].map((name) => [name, () => null]));
    const dropdowns = Object.fromEntries(["DropdownMenu", "DropdownMenuTrigger", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuLabel"]
      .map((name) => [name, () => null]));
    const { NotificationMenu } = loadSource("components/notification-menu.tsx", {
      react: hooks.react, "react/jsx-runtime": jsxRuntime,
      "next/link": { default: Link, __esModule: true }, "lucide-react": icons,
      "@/app/notifications/actions": {
        listNotificationsAction: async () => response([item("1", { read_at: readAt })], {
          unreadCount: 0, cutoff: listCutoff, nextCursor: { created_at: cutoff, id: "1" },
        }),
        deleteAllNotificationsAction: (...args) => { deletes.push(args); return pending[deletes.length - 1].promise; },
        deleteNotificationAction: (...args) => unrelatedWrites.push(args),
        markNotificationReadAction: (...args) => unrelatedWrites.push(args),
        markAllNotificationsReadAction: (...args) => unrelatedWrites.push(args),
      },
      "@/lib/supabase/client": { createClient: () => ({ auth: { onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }) } }) },
      "@/lib/confirmed-navigation": confirmedNavigation,
      "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
      "@/components/ui/sonner": { toast: { error() {} } },
      "@/components/ui/dropdown-menu": dropdowns,
      "./notification-menu-state": { createNotificationInbox, safeNotificationLink },
    }, { window, document: { ...eventSurface(), visibilityState: "visible" }, navigator: {} });
    const entries = (node, parents = []) => {
      if (Array.isArray(node)) return node.flatMap((child) => entries(child, parents));
      if (!node?.props) return [];
      return [{ node, parents }, ...entries(node.props.children, [...parents, node])];
    };
    const text = (node) => typeof node === "string" ? node
      : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
    const render = () => hooks.render(() => NotificationMenu({ userId: "user-a", initialUnreadCount: 0 }));
    let tree = render();
    await new Promise(setImmediate);
    tree.props.onOpenChange(true);
    await new Promise(setImmediate);
    tree = render();
    const menuItem = (label) => entries(tree).find(({ node }) => node.type === dropdowns.DropdownMenuItem && text(node).trim() === label);
    const bulk = menuItem("모두 삭제");
    const read = menuItem("모두 읽음");
    assert.ok(bulk);
    assert.equal(read.parents.at(-1), bulk.parents.at(-1));
    const headerActions = read.parents.at(-1).props.children;
    assert.equal(headerActions.length, 2);
    assert.equal(headerActions[0], read.node);
    assert.equal(headerActions[1], bulk.node, "bulk deletion belongs immediately next to mark-all");
    assert.equal(read.node.props.disabled, true);
    assert.equal(bulk.node.props.disabled, false, "read notifications must still be deletable");
    assert.ok(entries(bulk.node).some(({ node }) => node.type === icons.X));

    for (let attempt = 0; attempt < (failFirst ? 2 : 1); attempt++) {
      const selected = menuItem(attempt === 0 ? "모두 삭제" : "모두 삭제 다시 시도");
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      selected.node.props.onSelect(event);
      assert.equal(event.defaultPrevented, true);
      await Promise.resolve();
      tree = render();
      assert.equal(tree.props.open, true);
      assert.equal(menuItem("모두 삭제").node.props.disabled, true);
      assert.equal(menuItem("모두 읽음").node.props.disabled, true);
      assert.ok(entries(menuItem("모두 삭제").node).some(({ node }) => node.type === icons.Loader2));
      const link = entries(tree).find(({ node }) => node.type === Link);
      assert.equal(link.parents.at(-1).props.disabled, true);
      assert.equal(entries(tree).find(({ node }) => node.props["aria-label"] === "Notification 1 삭제").node.props.disabled, true);
      assert.deepEqual(unrelatedWrites, []);

      if (failFirst && attempt === 0) {
        pending[attempt].resolve({ ok: false, error: "모두 삭제하지 못했습니다." });
        await new Promise(setImmediate);
        tree = render();
        assert.ok(entries(tree).some(({ node }) => node.props.role === "alert" && text(node) === "모두 삭제하지 못했습니다."));
        assert.ok(menuItem("모두 삭제 다시 시도"));
        listCutoff = "2026-09-27T01:02:00.000Z";
        window.dispatchEvent({ type: "focus" });
        await new Promise(setImmediate);
        tree = render();
      } else {
        pending[attempt].resolve({ ok: true, userId: "user-a", unreadCount: 0 });
        await new Promise(setImmediate);
        tree = render();
      }
    }
    assert.deepEqual(deletes, failFirst ? [[cutoff, "user-a"], [cutoff, "user-a"]] : [[cutoff, "user-a"]]);
    assert.equal(tree.props.open, true);
    assert.equal(menuItem("모두 삭제").node.props.disabled, true);
    assert.equal(menuItem("이전 알림 더 보기"), undefined);
    assert.match(text(tree), /아직 도착한 알림이 없습니다/);
    assert.equal(entries(tree).some(({ node }) => node.type === Link), false);
    assert.deepEqual(unrelatedWrites, []);
    hooks.cleanup();
  }
});
