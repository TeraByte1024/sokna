import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/nomination-notifications";

export async function GET() {
	try {
		const result = await processNotificationQueue();
		return NextResponse.json({
			ok: true,
			...result,
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

export async function POST() {
	return GET();
}
