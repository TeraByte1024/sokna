import "server-only";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { recordSignupConsent } from "@/lib/record-signup-consent";
import { readSignupConsent, SIGNUP_CONSENT_COOKIE, SIGNUP_CONSENT_METADATA } from "@/lib/signup-consent";

export async function restoreSignupConsent(user: User) {
  const emailReceipt = user.user_metadata?.[SIGNUP_CONSENT_METADATA];
  if (readSignupConsent(emailReceipt)?.method === "email") return recordSignupConsent(user, emailReceipt);
  const completedReceipt = (await cookies()).get(SIGNUP_CONSENT_COOKIE)?.value;
  if (readSignupConsent(completedReceipt)?.userId === user.id) return recordSignupConsent(user, completedReceipt);
  return null;
}
