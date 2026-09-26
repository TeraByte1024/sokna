"use client";

import { useEffect } from "react";

/** 알림 표시는 서비스 워커가 담당하고 페이지는 등록/기기 상태만 동기화합니다. */
export function PushMessageListener() {
	useEffect(() => {
		let active = true;
		let registering = false;
		let lastRegisteredAt = 0;
		let stopDeviceSync: (() => void) | undefined;

		const wakeRecovery = async (registration?: ServiceWorkerRegistration) => {
			if (!active || !("serviceWorker" in navigator)) return;
			try {
				const current = registration ?? await navigator.serviceWorker.getRegistration("/");
				const worker = current?.active ?? navigator.serviceWorker.controller;
				if (active) worker?.postMessage({ type: "SOKNA_PUSH_RECOVERY" });
			} catch (error) {
				console.error("푸시 알림 복구 요청 실패:", error);
			}
		};
		const registerWhenPermitted = async () => {
			if (!active || registering || !("serviceWorker" in navigator) || !("Notification" in window)) return;
			if (Notification.permission !== "granted" || Date.now() - lastRegisteredAt < 60_000) return;
			registering = true;
			try {
				const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
				lastRegisteredAt = Date.now();
				await wakeRecovery(registration);
			} catch (error) {
				console.error("푸시 서비스 워커 갱신 실패:", error);
			} finally {
				registering = false;
			}
		};
		const refresh = () => {
			void registerWhenPermitted();
			// Retry temporary authorization failures independently of the worker update cooldown.
			void wakeRecovery();
		};
		const onControllerChange = () => { void wakeRecovery(); };
		const onVisible = () => {
			if (document.visibilityState === "visible") refresh();
		};
		window.addEventListener("sokna-push-token-change", refresh);
		window.addEventListener("focus", refresh);
		window.addEventListener("online", refresh);
		window.addEventListener("pageshow", refresh);
		document.addEventListener("visibilitychange", onVisible);
		if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
		refresh();

		void import("@/lib/firebase/push-device")
			.then(({ startPushDeviceSync, refreshPushDevice }) => {
				if (!active) return;
				stopDeviceSync = startPushDeviceSync();
				// Resume deferred authorization after the current device binding is verified.
				void refreshPushDevice().then(() => wakeRecovery())
					.catch((error) => console.error("푸시 연결 확인 후 알림 복구 실패:", error));
			})
			.catch((error) => console.error("푸시 기기 동기화 초기화 실패:", error));

		return () => {
			active = false;
			window.removeEventListener("sokna-push-token-change", refresh);
			window.removeEventListener("focus", refresh);
			window.removeEventListener("online", refresh);
			window.removeEventListener("pageshow", refresh);
			document.removeEventListener("visibilitychange", onVisible);
			if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
			stopDeviceSync?.();
		};
	}, []);
	return null;
}
