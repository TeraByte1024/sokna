import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNUP_CONSENT_COOKIE = "sokna-signup-consent";
export const SIGNUP_CONSENT_METADATA = "signup_legal_consent";
export type SignupConsentMethod = "signup" | "email" | "google" | "kakao";
export type SignupConsentTicket = {
  method: SignupConsentMethod;
  email?: string;
  userId?: string;
  revision: string;
  acceptedAt: number;
  marketingAgreed: boolean;
  preview: boolean;
};

function secret() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing signup consent signing key");
  return createHmac("sha256", key).update("sokna-signup-consent-v1").digest();
}

export function signSignupConsent(ticket: SignupConsentTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function readSignupConsent(value: unknown): SignupConsentTicket | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra !== undefined) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!["signup", "email", "google", "kakao"].includes(ticket.method) ||
      typeof ticket.revision !== "string" || !/^[a-f0-9]{64}$/.test(ticket.revision) ||
      typeof ticket.marketingAgreed !== "boolean" || typeof ticket.preview !== "boolean" ||
      typeof ticket.acceptedAt !== "number" || !Number.isFinite(ticket.acceptedAt) ||
      ticket.acceptedAt > Date.now() || Date.now() - ticket.acceptedAt > 7 * 86400_000 ||
      (ticket.method === "email" && (typeof ticket.email !== "string" || !ticket.email)) ||
      (ticket.userId !== undefined && typeof ticket.userId !== "string") ||
      (ticket.preview && process.env.NODE_ENV !== "development")) return null;
    return ticket;
  } catch { return null; }
}

export function signupConsentMatchesUser(ticket: SignupConsentTicket, user: {
  id: string; email?: string; created_at?: string; app_metadata?: { provider?: string }; identities?: { provider: string }[];
}) {
  if (ticket.userId) return ticket.userId === user.id;
  if (ticket.method === "email") {
    const createdAt = Date.parse(user.created_at ?? "");
    return ticket.email === user.email?.trim().toLowerCase() && Number.isFinite(createdAt) &&
      createdAt >= ticket.acceptedAt - 60_000 && createdAt <= ticket.acceptedAt + 3600_000;
  }
  return (user.app_metadata?.provider === ticket.method || user.identities?.some((identity) => identity.provider === ticket.method)) &&
    Date.now() - ticket.acceptedAt <= 3600_000;
}
