"use client";

import { deleteToken, getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { getSupportedMessaging } from "@/lib/firebase/firebase";

export async function isPushNotificationSupported() {
	return (await getSupportedMessaging()) !== null;
}

export async function requestNotificationPermission() {
	if (
		typeof window === "undefined" ||
		!("Notification" in window) ||
		!("serviceWorker" in navigator) ||
		!("PushManager" in window)
	) {
		return { data: null, error: "이 브라우저는 FCM을 지원하지 않습니다." };
	}

	try {
		// iOS는 사용자 탭 동작 안에서 권한 요청을 시작해야 합니다.
		const permission = await Notification.requestPermission();
		return permission === "granted"
			? { data: permission, error: null }
			: { data: null, error: "브라우저 알림 권한이 허용되지 않았습니다." };
	} catch {
		return { data: null, error: "브라우저 알림 권한을 요청하지 못했습니다." };
	}
}

export async function getFcmToken(serviceWorkerRegistration?: ServiceWorkerRegistration) {
	const messaging = await getSupportedMessaging();
	if (!messaging) return { data: null, error: "Firebase Messaging이 초기화되지 않았습니다." };
	const token = await getToken(messaging, {
		vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration,
	});
	return token ? { data: token, error: null } : { data: null, error: "FCM 토큰 발급에 실패했습니다." };
}

export async function deleteFcmToken() {
	const messaging = await getSupportedMessaging();
	if (!messaging) return { data: null, error: "Firebase Messaging이 초기화되지 않았습니다." };
	const deleted = await deleteToken(messaging);
	return deleted ? { data: true, error: null } : { data: null, error: "브라우저 토큰 삭제에 실패했습니다." };
}

export async function onForegroundMessage(handler: (payload: MessagePayload) => void) {
	const messaging = await getSupportedMessaging();
	if (!messaging) {
		return { data: null, error: "Firebase Messaging을 지원하지 않는 브라우저입니다." };
	}

	try {
		return { data: onMessage(messaging, handler), error: null };
	} catch {
		return { data: null, error: "Firebase Messaging 수신기를 시작하지 못했습니다." };
	}
}
