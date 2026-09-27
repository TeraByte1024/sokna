import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getFirebaseAdminApp() {
	const existing = getApps()[0];
	if (existing) return existing;

	const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
	const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
	const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

	if (!projectId || !clientEmail || !privateKey) {
		const code = "app/missing-configuration";
		const missing = Object.entries({
			NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
			FIREBASE_CLIENT_EMAIL: clientEmail,
			FIREBASE_PRIVATE_KEY: privateKey,
		}).filter(([, value]) => !value).map(([name]) => name);
		// Log variable names only; credentials and provider messages must stay private.
		console.error("[push-delivery] Firebase Admin configuration missing", { code, missing });
		// Keep this retryable so fixing the deployment can recover pending notifications.
		throw Object.assign(new Error("Firebase Admin 환경 변수가 설정되지 않았습니다."), { code });
	}

	return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export function getFirebaseAdminMessaging() {
	return getMessaging(getFirebaseAdminApp());
}
