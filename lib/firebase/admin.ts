import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getFirebaseAdminApp() {
	const existing = getApps()[0];
	if (existing) return existing;

	const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
	const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
	const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

	if (!projectId || !clientEmail || !privateKey) {
		throw new Error(
			"Firebase Admin 환경 변수(project id, client email, private key)가 설정되지 않았습니다.",
		);
	}

	return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export function getFirebaseAdminMessaging() {
	return getMessaging(getFirebaseAdminApp());
}
