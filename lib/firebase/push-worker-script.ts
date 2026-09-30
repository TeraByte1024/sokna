// Generated as a classic service worker by the app route; keep browser APIs inside this string.
export const PUSH_WORKER_SCRIPT = `
self.addEventListener("install", () => self.skipWaiting());

let sessionEpoch = 0;
let work = Promise.resolve();
let databasePromise;
const memory = new Map();
const MAX_AGE = 24 * 60 * 60_000;
const RECOVERY_WINDOW = 15 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enqueue(task) {
  const result = work.then(task);
  work = result.catch(() => {});
  return result;
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("sokna-push-recovery", 1);
    const timeout = setTimeout(() => reject(new Error("Push storage timed out")), 2000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("records")) request.result.createObjectStore("records", { keyPath: "key" });
    };
    request.onsuccess = () => { clearTimeout(timeout); resolve(request.result); };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

async function storageOperation(method, value) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("records", ["get", "getAll"].includes(method) ? "readonly" : "readwrite");
    const timeout = setTimeout(() => {
      try { transaction.abort(); } catch {}
      reject(new Error("Push storage timed out"));
    }, 2000);
    const request = transaction.objectStore("records")[method](value);
    transaction.oncomplete = () => { clearTimeout(timeout); resolve(request.result); };
    transaction.onerror = transaction.onabort = () => { clearTimeout(timeout); reject(transaction.error || request.error); };
  });
}
async function getRecord(key) { return memory.get(key) || await storageOperation("get", key).catch(() => null); }
async function putRecord(record) { memory.set(record.key, record); await storageOperation("put", record).catch(() => {}); }
async function deleteRecord(key) { memory.delete(key); await storageOperation("delete", key).catch(() => {}); }
async function records() {
  const stored = await storageOperation("getAll").catch(() => []);
  for (const record of stored) if (!memory.has(record.key)) memory.set(record.key, record);
  for (const [key, record] of memory) if (record.expiresAt <= Date.now()) {
    if (record.kind === "pending" && record.notificationExpiresAt > Date.now()) {
      await finish(record.recipient, record.notificationId, record.notificationExpiresAt);
    } else await deleteRecord(key);
  }
  // Keep live budgets and duplicate markers until their TTL; count-based eviction
  // would let a redelivered push restart recovery or display again.
  return [...memory.values()];
}
function recordKey(kind, recipient, id) { return kind + ":" + recipient + ":" + id; }
async function finish(recipient, id, expiresAt) {
  if (!id) return;
  // Only IDs, attempt budget and expiry persist; never message contents, URLs or tokens.
  await putRecord({ key: recordKey("handled", recipient, id), kind: "handled", expiresAt });
  await deleteRecord(recordKey("pending", recipient, id));
}
async function wasHandled(recipient, id) {
  if (!id) return false;
  const record = await getRecord(recordKey("handled", recipient, id));
  return Boolean(record && record.expiresAt > Date.now());
}
async function scheduleRecovery() {
  try { await self.registration.sync?.register("sokna-push-recovery"); } catch {}
}
async function deferNotification(recipient, id, expiresAt) {
  if (!UUID.test(id || "")) return;
  const key = recordKey("pending", recipient, id);
  if (!await getRecord(key)) await putRecord({
    key, kind: "pending", recipient, notificationId: id, attempts: 0, nextAttemptAt: Date.now(),
    expiresAt: Math.min(expiresAt, Date.now() + RECOVERY_WINDOW), notificationExpiresAt: expiresAt,
  });
  await scheduleRecovery();
}
async function authorize(recipient, notificationId) {
  if (typeof recipient !== "string" || !recipient) return { status: "denied" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const url = "/api/push/authorize" + (notificationId ? "?notificationId=" + encodeURIComponent(notificationId) : "");
    const response = await fetch(url, { credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal });
    if (!response.ok) return { status: [400, 401, 403, 404, 410].includes(response.status) ? "denied" : "unavailable" };
    const session = await response.json();
    if (!session || (session.userId !== null && typeof session.userId !== "string")) return { status: "unavailable" };
    if (session.userId !== recipient) return { status: "denied" };
    if (notificationId && (!session.notification || session.notification.id !== notificationId)) return { status: "denied" };
    return { status: "allowed", notification: session.notification };
  } catch { return { status: "unavailable" }; }
  finally { clearTimeout(timeout); }
}
function safeNotificationUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    if (url.origin === self.location.origin && ["https:", "http:"].includes(url.protocol)) return url.href;
  } catch {}
  return self.location.origin + "/";
}
async function showDelayedNotice(tag) {
  await self.registration.showNotification("소크나 알림 확인 지연", {
    body: "앱의 알림 목록에서도 확인할 수 있습니다.", icon: "/logos/logo_app_icon.png",
    tag, renotify: false, silent: true, data: { pushRecovery: true, url: self.location.origin + "/" },
  }).catch(() => {});
}
async function displayMessage({ recipient, id, expiresAt, title, body, url, tag }, epoch) {
  if (epoch !== sessionEpoch || expiresAt <= Date.now()) { await finish(recipient, id, expiresAt); return true; }
  const existing = tag ? await self.registration.getNotifications({ tag }).catch(() => []) : [];
  if (epoch !== sessionEpoch || expiresAt <= Date.now()) { await finish(recipient, id, expiresAt); return true; }
  if (!existing.some(item => item.data?.recipientUserId === recipient && !item.data?.pushRecovery)) {
    try {
      await self.registration.showNotification(title || "소크나 알림", {
        body: body || "새로운 알림이 도착했습니다.", icon: "/logos/logo_app_icon.png", tag, renotify: false,
        data: { url: safeNotificationUrl(url), recipientUserId: recipient, notificationId: id },
      });
    } catch { return false; }
  }
  if (epoch !== sessionEpoch) {
    const stale = await self.registration.getNotifications(tag ? { tag } : {}).catch(() => []);
    stale.filter(item => item.data?.recipientUserId === recipient).forEach(item => item.close());
  }
  // This local duplicate marker is not a server display acknowledgement.
  await finish(recipient, id, expiresAt);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach(client => client.postMessage({ type: "SOKNA_NOTIFICATIONS_CHANGED" }));
  return true;
}
async function recoverPending() {
  const epoch = sessionEpoch;
  const pending = (await records()).filter(record => record.kind === "pending"
    && (record.attempts >= 3 || record.nextAttemptAt <= Date.now()))
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);
  const startedAt = Date.now();
  for (const record of pending.slice(0, 3)) {
    if (epoch !== sessionEpoch || Date.now() - startedAt > 15_000) break;
    if (record.attempts >= 3 || record.expiresAt <= Date.now()) {
      await finish(record.recipient, record.notificationId, record.notificationExpiresAt); continue;
    }
    if (record.nextAttemptAt > Date.now()) continue;
    if (await wasHandled(record.recipient, record.notificationId)) { await deleteRecord(record.key); continue; }
    // Persist before I/O: worker termination cannot reset the attempt budget.
    const updated = { ...record, attempts: record.attempts + 1,
      nextAttemptAt: Date.now() + [60_000, 3 * 60_000, 5 * 60_000][record.attempts] };
    await putRecord(updated);
    const result = await authorize(record.recipient, record.notificationId);
    if (epoch !== sessionEpoch || result.status === "denied" || record.expiresAt <= Date.now()) {
      await finish(record.recipient, record.notificationId, record.notificationExpiresAt); continue;
    }
    if (result.status === "allowed") {
      const item = result.notification;
      if (await displayMessage({ recipient: record.recipient, id: record.notificationId,
        expiresAt: record.notificationExpiresAt, title: item.title, body: item.body, url: item.link,
        tag: "sokna-notification-" + record.notificationId }, epoch)) continue;
    }
    if (updated.attempts >= 3) await finish(record.recipient, record.notificationId, record.notificationExpiresAt);
  }
  return (await records()).some(record => record.kind === "pending");
}
self.addEventListener("message", event => {
  if (event.data?.type === "SOKNA_PUSH_RECOVERY") {
    event.waitUntil(enqueue(recoverPending).then(async pending => { if (pending) await scheduleRecovery(); }));
    return;
  }
  if (event.data?.type !== "SOKNA_PUSH_SESSION_CHANGED") return;
  sessionEpoch++;
  // Close immediately; queue metadata cleanup behind an in-flight display.
  event.waitUntil(self.registration.getNotifications().then(items => items.forEach(item => item.close())));
  event.waitUntil(enqueue(async () => {
    for (const record of await records()) if (record.kind === "pending") {
      await finish(record.recipient, record.notificationId, record.notificationExpiresAt);
    }
  }));
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
  event.waitUntil(enqueue(recoverPending));
});
self.addEventListener("sync", event => {
  if (event.tag === "sokna-push-recovery") event.waitUntil(enqueue(recoverPending).then(pending => {
    if (pending) throw new Error("Notification recovery pending");
  }));
});
// Intercept before Firebase's foreground branch; data-only stays with Firebase.
self.addEventListener("push", event => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload?.notification || typeof payload.notification !== "object" || Array.isArray(payload.notification)) return;
  event.stopImmediatePropagation();
  const epoch = sessionEpoch;
  event.waitUntil(enqueue(async () => {
    const recipient = payload.data?.recipientUserId;
    if (typeof recipient !== "string" || !recipient) return;
    const id = payload.data?.notificationId;
    const statedExpiry = Number(payload.data?.expiresAt);
    const expiresAt = Number.isFinite(statedExpiry) && statedExpiry > 0 ? statedExpiry : Date.now() + MAX_AGE;
    if (expiresAt <= Date.now()) return;
    if (epoch !== sessionEpoch) { await finish(recipient, id, expiresAt); return; }
    await records();
    if (await wasHandled(recipient, id)) return;
    if (id && await getRecord(recordKey("pending", recipient, id))) {
      if (epoch !== sessionEpoch) { await finish(recipient, id, expiresAt); return; }
      // FCM redelivery is another recovery wake, not a new initial attempt.
      if (await recoverPending()) await scheduleRecovery();
      return;
    }
    const notification = payload.notification;
    const messageId = payload.fcmMessageId || payload.message_id;
    const tag = id ? "sokna-notification-" + id
      : notification.tag || payload.data?.tag || (messageId ? "sokna-message-" + messageId : undefined);
    const result = await authorize(recipient);
    if (epoch !== sessionEpoch || result.status === "denied") { await finish(recipient, id, expiresAt); return; }
    if (result.status === "allowed" && await displayMessage({ recipient, id, expiresAt,
      title: notification.title, body: notification.body,
      url: payload.data?.url || payload.fcmOptions?.link || notification.click_action, tag }, epoch)) return;
    if (epoch !== sessionEpoch) { await finish(recipient, id, expiresAt); return; }
    await deferNotification(recipient, id, expiresAt);
    await showDelayedNotice(tag);
  }));
});
self.addEventListener("notificationclick", event => {
  event.stopImmediatePropagation();
  event.notification.close();
  if (event.notification.data?.pushRecovery) {
    event.waitUntil(self.clients.openWindow(self.location.origin + "/")); return;
  }
  const fcm = event.notification.data?.FCM_MSG;
  const recipient = event.notification.data?.recipientUserId || fcm?.data?.recipientUserId;
  const targetUrl = safeNotificationUrl(event.notification.data?.url || fcm?.data?.url || fcm?.fcmOptions?.link);
  const epoch = sessionEpoch;
  event.waitUntil((async () => {
    if ((await authorize(recipient)).status !== "allowed" || epoch !== sessionEpoch) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (epoch !== sessionEpoch) return;
    for (const client of windows) if (client.url === targetUrl && "focus" in client) return client.focus();
    return self.clients.openWindow(targetUrl);
  })());
});
`;
