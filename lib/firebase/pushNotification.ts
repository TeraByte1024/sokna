"use client";

import { getToken, isSupported, onMessage } from "firebase/messaging";
import { messaging } from "@/lib/firebase/firebase";

// 푸시 알림 권한 요청
export async function requestNotificationPermission() {
  // 서비스워커 등록 오류
  if (!window.navigator.serviceWorker) {
    return { data: null, error: "서비스워커 등록 오류" };
  }

  // FCM 지원 여부 확인
  const supported = await isSupported();
  if (!supported) {
    return { data: null, error: "이 브라우저는 FCM을 지원하지 않습니다." };
  }

  // 알림 권한 요청
  const permission = await Notification.requestPermission();

  // 알림 거부
  if (permission === "denied") {
    return { data: null, error: "알림 거부" };
  }

  // ...알림 권한 허용 시 실행할 코드...
  return { data: "알림 허용", error: null };
}

// FCM 토큰 발급
export async function getFcmToken() {
  // messaging이 undefined인 경우 처리
  if (!messaging) {
    return { data: null, error: "Firebase Messaging이 초기화되지 않았습니다." };
  }
  // 토큰 발급
  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  });

  if (!token) {
    return { data: null, error: "토큰 발급 실패" };
  }

  return { data: token, error: null };
}

// 푸시 알림 메시지 수신
export async function onForegroundMessage() {
  if (!messaging) {
    return { data: null, error: "Firebase Messaging이 초기화되지 않았습니다." };
  }

  // 포그라운드 환경에서 메시지 수신 시 실행
  onMessage(messaging, (payload) => {
    alert("메시지가 도착했습니다." + payload);
  });
}