import { NextRequest, NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/nomination-notifications";
import { processPendingPushNotifications } from "@/lib/push-notifications";

function isAuthorized(request: NextRequest) {
	const secret = process.env.CRON_SECRET;
	if (!secret) return process.env.NODE_ENV !== "production";
	return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	try {
		const nominationQueues = await processNotificationQueue();
		const pendingPush = await processPendingPushNotifications();
		return NextResponse.json({
			ok: true,
			nominationQueues,
			pendingPush,
			timestamp: new Date().toISOString(),
		});
	} catch (error: unknown) {
		console.error("Cron notification queue error:", error);
		const message = error instanceof Error ? error.message : "Internal server error";
		return NextResponse.json(
			{ ok: false, error: message },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	return GET(request);
}
