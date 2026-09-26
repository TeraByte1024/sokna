import { NextResponse } from "next/server";
import { PUSH_WORKER_SCRIPT } from "@/lib/firebase/push-worker-script";

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

	const script = `${PUSH_WORKER_SCRIPT}\nimportScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
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
