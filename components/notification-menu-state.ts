import type { NotificationCursor, NotificationInboxItem as InboxNotification } from "@/lib/notifications";

export type { InboxNotification, NotificationCursor };

type Failure = { ok: false; error: string };
type ReadResult = { ok: true; userId: string; unreadCount: number; readAt: string } | Failure;

export interface NotificationInboxApi {
  list(input: { expectedUserId: string; cursor?: NotificationCursor | null; cutoff?: string }): Promise<{
    ok: true;
    userId: string;
    items: InboxNotification[];
    unreadCount: number;
    nextCursor: NotificationCursor | null;
    cutoff: string;
  } | Failure>;
  markRead(id: string, expectedUserId: string): Promise<ReadResult>;
  markAllRead(cutoff: string, expectedUserId: string): Promise<ReadResult>;
}

export interface NotificationInboxSnapshot {
  userId: string | null;
  items: InboxNotification[];
  unreadCount: number | null;
  nextCursor: NotificationCursor | null;
  cutoff: string | null;
  loading: boolean;
  loadingMore: boolean;
  markingAll: boolean;
  error: string | null;
  errorKind: "refresh" | "more";
  mutationError: string | null;
  mutationKind: "single" | "all" | null;
}

function emptySnapshot(userId: string | null, unreadCount: number | null): NotificationInboxSnapshot {
  return {
    userId, unreadCount, items: [], nextCursor: null, cutoff: null,
    loading: false, loadingMore: false, markingAll: false,
    error: null, errorKind: "refresh", mutationError: null, mutationKind: null,
  };
}

/** PostgreSQL timestamps retain microseconds that Date.parse truncates. */
export function notificationAtOrBeforeCutoff(createdAt: string, cutoff: string): boolean {
  const createdMs = Date.parse(createdAt);
  const cutoffMs = Date.parse(cutoff);
  if (!Number.isFinite(createdMs) || !Number.isFinite(cutoffMs)) return false;
  if (createdMs !== cutoffMs) return createdMs < cutoffMs;
  const remainder = (timestamp: string) => {
    const fraction = timestamp.match(/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
    return Number(fraction.padEnd(6, "0").slice(3));
  };
  return remainder(createdAt) <= remainder(cutoff);
}

/** Keep account changes and late network responses out of the displayed inbox. */
export function createNotificationInbox(api: NotificationInboxApi, userId: string, unreadCount: number | null) {
  let state = emptySnapshot(userId, unreadCount);
  let accountVersion = 0;
  let listVersion = 0;
  let writes: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<NotificationInboxSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const isCurrent = (version: number, expectedUserId: string) =>
    version === accountVersion && state.userId === expectedUserId;
  function setUser(nextUserId: string | null, initialCount: number | null = null) {
    if (state.userId === nextUserId) return false;
    accountVersion++;
    listVersion++;
    writes = Promise.resolve();
    state = emptySnapshot(nextUserId, initialCount);
    listeners.forEach((listener) => listener());
    return true;
  }

  async function load(more: boolean) {
    const expectedUserId = state.userId;
    if (!expectedUserId || (more && (!state.nextCursor || state.loading || state.loadingMore))) return;
    const version = accountVersion;
    const request = ++listVersion;
    const cursor = more ? state.nextCursor : undefined;
    const cutoff = more ? state.cutoff ?? undefined : undefined;
    publish({ loading: !more, loadingMore: more, error: null, errorKind: more ? "more" : "refresh" });
    try {
      const result = await api.list({ expectedUserId, cursor, cutoff });
      if (!isCurrent(version, expectedUserId) || request !== listVersion) return;
      if (!result.ok) {
        publish({ error: result.error });
        return;
      }
      if (result.userId !== expectedUserId) { setUser(null); return; }
      const items = more
        ? [...new Map([...state.items, ...result.items].map((item) => [item.id, item])).values()]
        : result.items;
      publish({ items, unreadCount: result.unreadCount, nextCursor: result.nextCursor, cutoff: result.cutoff });
    } catch {
      if (isCurrent(version, expectedUserId) && request === listVersion) {
        publish({ error: "알림을 불러오지 못했습니다. 다시 시도해 주세요." });
      }
    } finally {
      if (isCurrent(version, expectedUserId) && request === listVersion) {
        publish({ loading: false, loadingMore: false });
      }
    }
  }

  function changeReadState(id: string | null) {
    const expectedUserId = state.userId;
    const version = accountVersion;
    const cutoff = state.cutoff;
    if (!expectedUserId || (!id && !cutoff)) return Promise.resolve(false);
    const operation = writes.then(async () => {
      if (!isCurrent(version, expectedUserId)) return false;
      // An older list response must not restore an unread marker after this write.
      listVersion++;
      publish({ loading: false, loadingMore: false, mutationError: null, mutationKind: id ? "single" : "all", markingAll: !id });
      try {
        const result = id
          ? await api.markRead(id, expectedUserId)
          : await api.markAllRead(cutoff!, expectedUserId);
        if (!isCurrent(version, expectedUserId)) return false;
        if (!result.ok) {
          publish({ mutationError: result.error });
          return false;
        }
        if (result.userId !== expectedUserId) { setUser(null); return false; }
        listVersion++;
        publish({
          loading: false, loadingMore: false,
          mutationKind: null,
          unreadCount: result.unreadCount,
          items: state.items.map((item) =>
            !item.read_at && (id ? item.id === id : notificationAtOrBeforeCutoff(item.created_at, cutoff!))
              ? { ...item, read_at: result.readAt } : item),
        });
        return true;
      } catch {
        if (isCurrent(version, expectedUserId)) {
          publish({ mutationError: "읽음 표시를 저장하지 못했습니다. 다시 시도해 주세요." });
        }
        return false;
      } finally {
        if (isCurrent(version, expectedUserId)) publish({ markingAll: false });
      }
    });
    writes = operation.catch(() => undefined);
    return operation;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setUser,
    refresh: () => load(false),
    loadMore: () => load(true),
    markRead: (id: string) => changeReadState(id),
    markAllRead: () => changeReadState(null),
  };
}

/** Links remain ordinary Next links so the existing unsaved-changes guard can intercept them. */
export function safeNotificationLink(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://notification.invalid");
    return url.origin === "https://notification.invalid" ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}
