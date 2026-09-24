"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/sonner";
export function PushMessageListener() {
	useEffect(() => {
		let active = true;
		let started = false;
		let unsubscribe: (() => void) | undefined;

		const startWhenPermitted = async () => {
			if (started || !("Notification" in window) || Notification.permission !== "granted") return;
			started = true;
			const { isPushNotificationSupported, onForegroundMessage } = await import("@/lib/firebase/pushNotification");
			if (!(await isPushNotificationSupported())) return;

			await navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((error) => {
				console.error("푸시 서비스 워커 갱신 실패:", error);
			});
			if (!active) return;

			const result = await onForegroundMessage((payload) => {
				const title = payload.notification?.title ?? "소크나 알림";
				const body = payload.notification?.body ?? "새로운 알림이 도착했습니다.";
				const url = payload.data?.url;
				toast(title, {
					description: body,
					action: url ? { label: "확인", onClick: () => window.location.assign(url) } : undefined,
				});
			});

			if (!result.data) return;
			if (active) unsubscribe = result.data;
			else result.data();
		};
		const onTokenChange = () => {
			void startWhenPermitted().catch((error) => {
				started = false;
				console.error("푸시 수신기 초기화 실패:", error);
			});
		};
		window.addEventListener("sokna-push-token-change", onTokenChange);
		onTokenChange();

		return () => {
			active = false;
			window.removeEventListener("sokna-push-token-change", onTokenChange);
			unsubscribe?.();
		};
	}, []);
	return null;
}
