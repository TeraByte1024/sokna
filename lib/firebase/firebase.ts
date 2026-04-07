"use client";

import { initializeApp } from "firebase/app";
import { getMessaging, Messaging } from "firebase/messaging";

// 프로젝트 설정
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 프로젝트 초기화
const app = initializeApp(firebaseConfig);

// 푸시 알림 관리 - 브라우저 환경에서만 초기화
let messaging: Messaging | undefined;

if (typeof window !== "undefined") {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Firebase Messaging 초기화 오류:", error);
  }
}

export { messaging };