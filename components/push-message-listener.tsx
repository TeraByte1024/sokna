"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/sonner";
import {
	isPushNotificationSupported,
	onForegroundMessage,
} from "@/lib/firebase/pushNotification";

export function PushMessageListener() {
	useEffect(() => {
		let active = true;
		let unsubscribe: (() => void) | undefined;

		void (async () => {
			if (!(await isPushNotificationSupported())) return;

			if (Notification.permission === "granted") {
				await navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((error) => {
					console.error("푸시 서비스 워커 갱신 실패:", error);
				});
			}

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
		})();

		return () => {
			active = false;
			unsubscribe?.();
		};
	}, []);
	return null;
}
