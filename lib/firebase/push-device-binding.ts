import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { atPushDeviceStage, PushDeviceError } from "@/lib/firebase/push-device-diagnostics";

const RECEIPT_LIFETIME_SECONDS = 365 * 24 * 60 * 60;
const RECEIPT_DOMAIN = "sokna:push-device-receipt:v1\0";
export const PUSH_DEVICE_COOKIE = process.env.NODE_ENV === "production"
	? "__Host-sokna-push-device" : "sokna-push-device";

interface DeviceReceipt {
	version: 1;
	profileId: string;
	tokenHash: string;
	expiresAt: number;
}

export interface VerifiedPushProfile {
	id: string;
	fcm_token: string;
	user_id: string | null;
}

function signingKey() {
	const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new PushDeviceError("receipt-sign");
	return key;
}

function tokenHash(token: string) {
	return createHash("sha256").update(token).digest("hex");
}

function signature(body: string) {
	return createHmac("sha256", signingKey()).update(RECEIPT_DOMAIN).update(body).digest();
}

async function readReceipt(): Promise<DeviceReceipt | null> {
	const value = await atPushDeviceStage("receipt-read", async () => (await cookies()).get(PUSH_DEVICE_COOKIE)?.value);
	if (!value || value.length > 2048) return null;
	const parts = value.split(".");
	if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
	const expected = await atPushDeviceStage("receipt-sign", () => signature(parts[0]));
	const actual = Buffer.from(parts[1], "base64url");
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
	try {
		const parsed: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
		if (!parsed || typeof parsed !== "object") return null;
		const receipt = parsed as Partial<DeviceReceipt>;
		if (receipt.version !== 1 || typeof receipt.profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(receipt.profileId)
			|| typeof receipt.tokenHash !== "string" || !/^[0-9a-f]{64}$/.test(receipt.tokenHash)
			|| typeof receipt.expiresAt !== "number" || !Number.isSafeInteger(receipt.expiresAt)
			|| receipt.expiresAt <= Math.floor(Date.now() / 1000)) return null;
		return receipt as DeviceReceipt;
	} catch {
		return null;
	}
}

export async function issuePushDeviceReceipt(profile: Pick<VerifiedPushProfile, "id" | "fcm_token">) {
	const receipt: DeviceReceipt = {
		version: 1, profileId: profile.id, tokenHash: tokenHash(profile.fcm_token),
		expiresAt: Math.floor(Date.now() / 1000) + RECEIPT_LIFETIME_SECONDS,
	};
	const body = Buffer.from(JSON.stringify(receipt)).toString("base64url");
	const value = body + "." + (await atPushDeviceStage("receipt-sign", () => signature(body))).toString("base64url");
	await atPushDeviceStage("receipt-write", async () => (await cookies()).set(PUSH_DEVICE_COOKIE, value, {
		httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
		maxAge: RECEIPT_LIFETIME_SECONDS,
	}));
}

export async function clearPushDeviceReceipt() {
	await atPushDeviceStage("receipt-clear", async () => (await cookies()).delete(PUSH_DEVICE_COOKIE));
}

/** A signed device receipt is required before accessing another account's or an unbound row. */
export async function getReceiptPushProfile(token?: string | null): Promise<VerifiedPushProfile | null> {
	const receipt = await readReceipt();
	if (!receipt || (token && tokenHash(token) !== receipt.tokenHash)) return null;
	const { data, error } = await atPushDeviceStage("receipt-profile-read", () => createServiceClient().from("profiles")
		.select("id, fcm_token, user_id").eq("id", receipt.profileId).maybeSingle());
	if (error) throw new PushDeviceError("receipt-profile-read", error);
	if (!data || tokenHash(data.fcm_token) !== receipt.tokenHash) return null;
	return data;
}

/** Presence alone can reject deletion-as-absent; it never authorizes use of a stale token. */
export async function hasPushDeviceReceiptProfile(): Promise<boolean> {
	const receipt = await readReceipt();
	if (!receipt) return false;
	const { data, error } = await atPushDeviceStage("receipt-profile-read", () => createServiceClient().from("profiles")
		.select("id").eq("id", receipt.profileId).maybeSingle());
	if (error) throw new PushDeviceError("receipt-profile-read", error);
	return Boolean(data);
}

/** Only a confirmed missing session means signed out; auth/network failures must not rebind devices. */
export async function getPushSession() {
	const supabase = await atPushDeviceStage("session", createClient);
	const { data: { user }, error } = await atPushDeviceStage("session", () => supabase.auth.getUser());
	if (error && error.name !== "AuthSessionMissingError") throw new PushDeviceError("session", error);
	return { supabase, user: error ? null : user };
}
