import { getSafeAuthNext } from "@/lib/auth/identity-linking";

export type SignupIntent = "signup" | "join";

export function getLoginDestination(next: string | null, origin: string): string {
  return getSafeAuthNext(next, origin);
}

export function getMembershipStepUrl(next: string | null, origin: string): string {
  return `/auth/membership?${new URLSearchParams({ redirect: getLoginDestination(next, origin) })}`;
}

export function getLoginCompletionDestination(next: string | null, origin: string, onboarding: string | null): string {
  return onboarding === "membership" ? getMembershipStepUrl(next, origin) : getLoginDestination(next, origin);
}

/** Signup opens the optional second step; neither intent grants membership. */
export function getOAuthCallbackUrl(origin: string, intent?: SignupIntent, next?: string, consentState?: string): string {
  const callback = new URL("/auth/callback", origin);
  if (intent) callback.searchParams.set("intent", intent);
  if (next) callback.searchParams.set("next", getLoginDestination(next, origin));
  if (consentState) callback.searchParams.set("consent_state", consentState);
  return callback.toString();
}
