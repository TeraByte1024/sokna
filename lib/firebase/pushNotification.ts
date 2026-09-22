"use client";

import { deleteToken, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";
import { messaging } from "@/lib/firebase/firebase";

export async function requestNotificationPermission() {
	if (!("serviceWorker" in navigator)) {
		return { data: null, error: "서비스 워커를 지원하지 않는 브라우저입니다." };
	}
	if (!(await isSupported())) {
		return { data: null, error: "이 브라우저는 FCM을 지원하지 않습니다." };
	}
	const permission = await Notification.requestPermission();
	return permission === "granted"
		? { data: permission, error: null }
		: { data: null, error: "브라우저 알림 권한이 허용되지 않았습니다." };
}

export async function getFcmToken(serviceWorkerRegistration?: ServiceWorkerRegistration) {
	if (!messaging) return { data: null, error: "Firebase Messaging이 초기화되지 않았습니다." };
	const token = await getToken(messaging, {
		vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration,
	});
	return token ? { data: token, error: null } : { data: null, error: "FCM 토큰 발급에 실패했습니다." };
}

export async function deleteFcmToken() {
	if (!messaging) return { data: null, error: "Firebase Messaging이 초기화되지 않았습니다." };
	const deleted = await deleteToken(messaging);
	return deleted ? { data: true, error: null } : { data: null, error: "브라우저 토큰 삭제에 실패했습니다." };
}

export async function onForegroundMessage(handler: (payload: MessagePayload) => void) {
	if (!messaging) return { data: null, error: "Firebase Messaging이 초기화되지 않았습니다." };
	return { data: onMessage(messaging, handler), error: null };
}
