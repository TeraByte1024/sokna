"use client";

import {
	detachPushDeviceAction,
	getPushDeviceStatusAction,
	refreshPushTokenAction,
	registerPushTokenAction,
	unregisterPushTokenAction,
} from "@/app/profile/notification-actions";

export const PUSH_TOKEN_STORAGE_KEY = "sokna-fcm-token";
export const PUSH_TOKEN_OWNER_KEY = "sokna-fcm-token-owner";
export const PUSH_TOKEN_CHANGE_EVENT = "sokna-push-token-change";
export const PUSH_SIGN_OUT_STORAGE_KEY = "sokna-push-signing-out";

type DeviceState = {
	permission: NotificationPermission | "unsupported";
	userId: string | null;
	hasMarketingConsent: boolean | null;
	hasRegisteredToken: boolean;
	isChecking: boolean;
};

const initialState: DeviceState = {
	permission: "default", userId: null, hasMarketingConsent: null,
	hasRegisteredToken: false, isChecking: false,
};
let state: DeviceState = initialState;
const listeners = new Set<() => void>();
let operations: Promise<unknown> = Promise.resolve();
let pendingRefresh: Promise<DeviceState> | null = null;
let refreshAgain = false;
let invalidationVersion = 0;
let dispatchingChange = false;
let messagingSupported: boolean | null = null;
let supportCheckRequested = false;
let signingOut = false;
let suspendedUserId: string | null = null;
const PASSIVE_REFRESH_INTERVAL_MS = 1_000;
let lastCheckedAt = -Infinity;
let lastCheckedPermission: DeviceState["permission"] | null = null;

export const getPushDeviceSnapshot = () => state;
export const getServerPushDeviceSnapshot = () => initialState;
export function subscribePushDevice(listener: () => void) {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}

function publish(patch: Partial<DeviceState>) {
	state = { ...state, ...patch };
	listeners.forEach((listener) => listener());
}

function readLocalDevice() {
	try {
		const token = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
		return token ? { token, owner: window.localStorage.getItem(PUSH_TOKEN_OWNER_KEY) } : null;
	} catch {
		return null;
	}
}

function readSignOutMarker(): { userId: string | null; until: number } | null {
	try {
		const raw = window.localStorage.getItem(PUSH_SIGN_OUT_STORAGE_KEY);
		if (!raw) return null;
		const value = JSON.parse(raw);
		return typeof value.until === "number" && value.until > Date.now()
			&& (value.userId === null || typeof value.userId === "string") ? value : null;
	} catch { return null; }
}

function isSigningOut() {
	return signingOut || Boolean(readSignOutMarker());
}

function saveLocalDevice(token: string, userId: string) {
	const previous = readLocalDevice();
	window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
	window.localStorage.setItem(PUSH_TOKEN_OWNER_KEY, userId);
	if (previous?.token !== token || previous.owner !== userId) {
		notifyTokenChange();
	}
}

function notifyTokenChange() {
	dispatchingChange = true;
	try { window.dispatchEvent(new Event(PUSH_TOKEN_CHANGE_EVENT)); }
	finally { dispatchingChange = false; }
}

function clearLocalOwner() {
	if (window.localStorage.getItem(PUSH_TOKEN_OWNER_KEY)) {
		window.localStorage.removeItem(PUSH_TOKEN_OWNER_KEY);
		notifyTokenChange();
	}
}

async function closeDisplayedPushNotifications() {
	if (!("serviceWorker" in navigator)) return;
	const registration = await navigator.serviceWorker.getRegistration("/");
	const notifications = await registration?.getNotifications();
	notifications?.forEach((notification) => notification.close());
}

function notifyPushSessionChanged() {
	if (!("serviceWorker" in navigator)) return;
	const message = { type: "SOKNA_PUSH_SESSION_CHANGED" };
	const controller = navigator.serviceWorker.controller;
	try { controller?.postMessage(message); }
	catch (error) { console.error("알림 세션 변경 전달 실패:", error); }
	void navigator.serviceWorker.getRegistration("/").then((registration) => {
		if (registration?.active && registration.active !== controller) registration.active.postMessage(message);
	}).catch((error) => { console.error("알림 서비스 워커 세션 동기화 실패:", error); });
}

function browserPermission(): DeviceState["permission"] {
	return typeof window === "undefined" || !("Notification" in window)
		|| !("serviceWorker" in navigator) || !("PushManager" in window)
		? "unsupported" : Notification.permission;
}

function permission(): DeviceState["permission"] {
	return messagingSupported === false ? "unsupported" : browserPermission();
}

// Serialize validation and user changes so an older check cannot restore an OFF toggle.
function runOperation<T>(operation: () => Promise<T>): Promise<T> {
	const result = operations.then(async (): Promise<T> => {
		if (typeof navigator !== "undefined" && "locks" in navigator) {
			return await navigator.locks.request("sokna-push-device", operation);
		}
		return await operation();
	});
	operations = result.catch(() => undefined);
	return result;
}

async function currentBrowserToken() {
	const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
	await navigator.serviceWorker.ready;
	const { getFcmToken } = await import("@/lib/firebase/pushNotification");
	const result = await getFcmToken(registration);
	if (!result.data) throw new Error(result.error ?? "FCM 토큰을 확인하지 못했습니다.");
	return result.data;
}

async function validateDevice(): Promise<DeviceState> {
	if (isSigningOut()) return state;
	const version = invalidationVersion;
	const checkedPermission = browserPermission();
	let checkFailed = false;
	publish({ permission: permission(), hasRegisteredToken: false, isChecking: true });
	try {
		if (supportCheckRequested || browserPermission() === "granted") {
			supportCheckRequested = false;
			const { isPushNotificationSupported } = await import("@/lib/firebase/pushNotification");
			messagingSupported = await isPushNotificationSupported();
			publish({ permission: permission() });
		}
		const local = readLocalDevice();
		const account = await getPushDeviceStatusAction(local?.token ?? null);
		if (!account.ok) throw new Error(account.error);
		if (isSigningOut() || version !== invalidationVersion) return state;
		if (local && (!account.userId || (local.owner && local.owner !== account.userId))) {
			await closeDisplayedPushNotifications().catch((error) => {
				console.error("이전 계정의 알림 닫기 실패:", error);
			});
		}
		if (isSigningOut() || version !== invalidationVersion) return state;
		publish({ userId: account.userId, hasMarketingConsent: account.marketingOptIn });
		if (!account.userId) clearLocalOwner();
		else if (local && account.registered) saveLocalDevice(local.token, account.userId);
		if (!account.userId || !account.marketingOptIn || !local || !account.registered
			|| permission() !== "granted" || isSigningOut() || version !== invalidationVersion) return state;

		const token = await currentBrowserToken();
		if (isSigningOut() || version !== invalidationVersion) return state;
		// Status verification already bound this device. Only a rotated token needs a write.
		if (token !== local.token) {
			// UPDATE-only cannot recreate a registration removed while getToken was running.
			const result = await refreshPushTokenAction(local.token, token, navigator.userAgent, account.userId);
			if (!result.ok) throw new Error(result.error);
		}
		if (readLocalDevice()?.token === local.token) saveLocalDevice(token, account.userId);
		if (version === invalidationVersion) publish({ permission: permission(), hasRegisteredToken: true });
	} catch (error) {
		checkFailed = true;
		publish({ hasRegisteredToken: false });
		console.error("기기 알림 상태 확인 실패:", error);
	} finally {
		if (version === invalidationVersion) {
			lastCheckedAt = checkFailed ? -Infinity : Date.now();
			lastCheckedPermission = checkedPermission;
		}
		publish({ isChecking: false });
	}
	return state;
}

export function refreshPushDevice(checkSupport = false): Promise<DeviceState> {
	if (typeof window === "undefined") return Promise.resolve(initialState);
	if (checkSupport) {
		supportCheckRequested = true;
		if (pendingRefresh) refreshAgain = true;
	}
	if (pendingRefresh) return pendingRefresh;
	const result = runOperation(validateDevice).then(() => state);
	pendingRefresh = result;
	void result.finally(() => {
		if (pendingRefresh === result) pendingRefresh = null;
		if (refreshAgain) {
			refreshAgain = false;
			void refreshPushDevice();
		}
	});
	return result;
}

/** Called only after a direct user gesture has granted notification permission. */
export function enablePushDevice() {
	return runOperation(async () => {
		if (isSigningOut()) throw new Error("로그아웃 처리 중입니다. 완료 후 다시 설정해 주세요.");
		const version = invalidationVersion;
		publish({ hasRegisteredToken: false, isChecking: true });
		try {
			const local = readLocalDevice();
			const account = await getPushDeviceStatusAction(local?.token ?? null);
			if (!account.ok) throw new Error(account.error);
			if (!account.userId) throw new Error("로그인이 필요합니다.");
			if (!account.marketingOptIn) throw new Error("먼저 알림 수신에 동의해 주세요.");
			if (permission() !== "granted") throw new Error("브라우저 알림 권한을 허용해 주세요.");

			// Account changes only rebind the existing device; they never rotate its FCM token.
			const token = await currentBrowserToken();
			const result = account.registered && local
				? await refreshPushTokenAction(local.token, token, navigator.userAgent, account.userId)
				: await registerPushTokenAction(token, navigator.userAgent, account.userId);
			if (!result.ok) throw new Error(result.error);
			saveLocalDevice(token, account.userId);
			if (isSigningOut() || version !== invalidationVersion) throw new Error("로그인 상태가 변경되었습니다. 다시 확인해 주세요.");
			publish({ permission: permission(), userId: account.userId, hasMarketingConsent: true, hasRegisteredToken: true });
		} finally {
			publish({ isChecking: false });
		}
	});
}

/** Preserve the device registration while removing its current account as a recipient. */
export function suspendPushDeviceForSignOut(): Promise<{ ok: boolean; error?: string }> {
	if (typeof window === "undefined") return Promise.resolve({ ok: true });
	signingOut = true;
	suspendedUserId = state.userId ?? readLocalDevice()?.owner ?? null;
	try {
		// Other tabs must not bind the still-valid old session back during logout.
		window.localStorage.setItem(PUSH_SIGN_OUT_STORAGE_KEY, JSON.stringify({ userId: suspendedUserId, until: Date.now() + 30_000 }));
	} catch { /* The service worker still verifies the current authenticated session. */ }
	invalidationVersion++;
	publish({ hasRegisteredToken: false, isChecking: true });
	notifyPushSessionChanged();
	return runOperation(async () => {
		const errors: string[] = [];
		try {
			const local = readLocalDevice();
			try {
				const result = await detachPushDeviceAction(local?.token ?? null);
				if (!result.ok) errors.push(result.error);
			} catch {
				errors.push("기기의 알림 수신 계정 연결을 정지하지 못했습니다.");
			}
			try { clearLocalOwner(); }
			catch { errors.push("이 기기의 로컬 계정 표시를 정리하지 못했습니다."); }
			try { await closeDisplayedPushNotifications(); }
			catch { errors.push("이미 표시된 알림을 닫지 못했습니다."); }
			publish({ userId: null, hasMarketingConsent: null, hasRegisteredToken: false });
			return errors.length ? { ok: false, error: errors.join(" ") } : { ok: true };
		} finally {
			publish({ isChecking: false });
		}
	});
}

/** Restore normal binding checks if the auth provider could not finish signing out. */
export function resumePushDeviceAfterSignOutFailure() {
	signingOut = false;
	suspendedUserId = null;
	try { window.localStorage.removeItem(PUSH_SIGN_OUT_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
	invalidationVersion++;
	if (pendingRefresh) refreshAgain = true;
	return refreshPushDevice();
}

export function disablePushDevice() {
	return runOperation(async () => {
		publish({ isChecking: true });
		try {
			const local = readLocalDevice();
			if (local) {
				const result = await unregisterPushTokenAction(local.token);
				if (!result.ok) throw new Error(result.error);
			}
			const { deleteFcmToken } = await import("@/lib/firebase/pushNotification");
			await deleteFcmToken().catch(() => undefined);
			window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
			window.localStorage.removeItem(PUSH_TOKEN_OWNER_KEY);
			publish({ hasRegisteredToken: false });
			notifyTokenChange();
		} finally {
			publish({ isChecking: false });
		}
	});
}

/** Global mount: no permission prompts, and no registration creation during passive checks. */
export function startPushDeviceSync() {
	if (typeof window === "undefined") return () => {};
	let active = true;
	let unsubscribeAuth: (() => void) | undefined;
	let lastAuthUserId: string | null | undefined;
	const refresh = () => {
		invalidationVersion++;
		publish({ hasRegisteredToken: false });
		if (pendingRefresh) refreshAgain = true;
		else void refreshPushDevice();
	};
	// Focus and visibility often describe the same resume. They must not invalidate
	// an in-flight check or queue another one; identity/settings changes still do.
	const onResume = () => {
		if (lastCheckedPermission !== null && browserPermission() !== lastCheckedPermission) {
			lastCheckedPermission = browserPermission();
			refresh();
			return;
		}
		if (pendingRefresh || Date.now() - lastCheckedAt < PASSIVE_REFRESH_INTERVAL_MS) return;
		void refreshPushDevice();
	};
	const onOnline = () => {
		const checking = pendingRefresh;
		onResume();
		// A request started offline can fail after the connection is already back.
		if (checking) void checking.then(() => {
			if (active && lastCheckedAt === -Infinity) void refreshPushDevice();
		});
	};
	const onTokenChange = () => { if (!dispatchingChange) refresh(); };
	const onVisible = () => { if (document.visibilityState === "visible") onResume(); };
	const onStorage = (event: StorageEvent) => {
		if (!event.key || event.key === PUSH_TOKEN_STORAGE_KEY || event.key === PUSH_TOKEN_OWNER_KEY || event.key === PUSH_SIGN_OUT_STORAGE_KEY) refresh();
	};
	window.addEventListener("focus", onResume);
	window.addEventListener("online", onOnline);
	window.addEventListener("storage", onStorage);
	window.addEventListener(PUSH_TOKEN_CHANGE_EVENT, onTokenChange);
	document.addEventListener("visibilitychange", onVisible);
	void import("@/lib/supabase/client").then(({ createClient }) => {
		if (!active) return;
		const { data } = createClient().auth.onAuthStateChange((event, session) => {
			const nextUserId = session?.user.id ?? null;
			const previousAuthUserId = lastAuthUserId === undefined ? state.userId : lastAuthUserId;
			lastAuthUserId = nextUserId;
			if (event === "INITIAL_SESSION") return;
			// Compare observed auth events, not a potentially stale asynchronous check:
			// A -> B -> A must invalidate B even while the displayed state still says A.
			const accountChanged = nextUserId !== previousAuthUserId;
			if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && !accountChanged) return;
			if (event === "SIGNED_OUT" || accountChanged) {
				notifyPushSessionChanged();
			}
			const previousUserId = suspendedUserId ?? readSignOutMarker()?.userId;
			if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && session?.user.id !== previousUserId)) {
				signingOut = false;
				suspendedUserId = null;
				try { window.localStorage.removeItem(PUSH_SIGN_OUT_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
			}
			if (event === "SIGNED_OUT") {
				void closeDisplayedPushNotifications().catch((error) => {
					console.error("로그아웃 후 알림 닫기 실패:", error);
				});
			}
			refresh();
		});
		unsubscribeAuth = () => data.subscription.unsubscribe();
	}).catch((error) => { console.error("기기 알림 로그인 동기화 실패:", error); });
	refresh();
	return () => {
		active = false;
		unsubscribeAuth?.();
		window.removeEventListener("focus", onResume);
		window.removeEventListener("online", onOnline);
		window.removeEventListener("storage", onStorage);
		window.removeEventListener(PUSH_TOKEN_CHANGE_EVENT, onTokenChange);
		document.removeEventListener("visibilitychange", onVisible);
	};
}
