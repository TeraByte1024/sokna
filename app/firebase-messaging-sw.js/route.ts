import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function serializeForScript(value: unknown) {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function GET() {
	const firebaseConfig = {
		apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
		authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
		projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
		storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
		messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
		appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
	};

	const script = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Firebase가 등록하는 기본 클릭 핸들러보다 먼저 선언해야 사용자 지정 이동 경로가 유지됩니다.
self.addEventListener("notificationclick", (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const fcmMessage = event.notification.data?.FCM_MSG;
  const relativeUrl = fcmMessage?.data?.url || event.notification.data?.url;
  const configuredLink = fcmMessage?.fcmOptions?.link;
  const targetUrl = relativeUrl
    ? new URL(relativeUrl, self.location.origin).href
    : configuredLink || self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

firebase.initializeApp(${serializeForScript(firebaseConfig)});
firebase.messaging();
`;

	return new NextResponse(script, {
		headers: {
			"Content-Type": "application/javascript; charset=utf-8",
			"Cache-Control": "no-cache, no-store, must-revalidate",
			"Service-Worker-Allowed": "/",
		},
	});
}
