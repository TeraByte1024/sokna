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
    "lucide-react": { Bell: icon, CheckCheck: icon, ChevronDown: icon, Loader2: icon, RefreshCw: icon },
    "@/app/notifications/actions": { listNotificationsAction() {}, markAllNotificationsReadAction() {}, markNotificationReadAction() {} },
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
      markAllNotificationsReadAction() {}, markNotificationReadAction() {},
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
        markAllNotificationsReadAction() {},
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
