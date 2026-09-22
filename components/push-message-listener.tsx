"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/sonner";
import { onForegroundMessage } from "@/lib/firebase/pushNotification";

export function PushMessageListener() {
	useEffect(() => {
		let unsubscribe: (() => void) | undefined;
		if ("serviceWorker" in navigator && Notification.permission === "granted") {
			navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((error) => {
				console.error("푸시 서비스 워커 갱신 실패:", error);
			});
		}
		onForegroundMessage((payload) => {
			const title = payload.notification?.title ?? "소크나 알림";
			const body = payload.notification?.body ?? "새로운 알림이 도착했습니다.";
			const url = payload.data?.url;
			toast(title, {
				description: body,
				action: url ? { label: "확인", onClick: () => window.location.assign(url) } : undefined,
			});
		}).then((result) => { if (result.data) unsubscribe = result.data; });
		return () => unsubscribe?.();
	}, []);
	return null;
}
