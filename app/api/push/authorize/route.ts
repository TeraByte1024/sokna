import { NextResponse } from "next/server";
import { getPushSession, getReceiptPushProfile } from "@/lib/firebase/push-device-binding";

export const dynamic = "force-dynamic";

interface AuthorizedNotification {
	id: string;
	title: string | null;
	body: string | null;
	link: string | null;
	created_at: string;
}

function respond(userId: string | null, status = 200, notification?: AuthorizedNotification) {
	return NextResponse.json({ userId, ...(notification ? { notification } : {}) }, { status, headers: {
		"Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie",
	} });
}

/** Read-only authorization for a service-worker push; never trusts a payload's account identity alone. */
export async function GET(request?: Request) {
	try {
		const { supabase, user } = await getPushSession();
		if (!user) return respond(null);
		const profile = await getReceiptPushProfile();
		if (!profile || profile.user_id !== user.id) return respond(null);
		const { data: account, error } = await supabase.from("users")
			.select("marketing_opt_in").eq("id", user.id).maybeSingle();
		if (error) return respond(null, 503);
		if (!account?.marketing_opt_in) return respond(null);
		const params = request ? new URL(request.url).searchParams : new URLSearchParams();
		if (!params.has("notificationId")) return respond(user.id);
		const ids = params.getAll("notificationId");
		if (ids.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0])) return respond(null);
		const { data: notification, error: notificationError } = await supabase.from("notifications")
			.select("id, title, body, link, created_at").eq("id", ids[0]).eq("user_id", user.id).maybeSingle();
		if (notificationError) return respond(null, 503);
		if (!notification || !Number.isFinite(Date.parse(notification.created_at))
			|| Date.now() >= Date.parse(notification.created_at) + 24 * 60 * 60_000) return respond(null);
		return respond(user.id, 200, notification);
	} catch {
		return respond(null, 503);
	}
}
