export const SOCIAL_PROVIDERS = ["google", "kakao"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export function isSocialProvider(value: unknown): value is SocialProvider {
  return value === "google" || value === "kakao";
}

export function getSocialProviderLabel(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "카카오";
  return provider;
}

// Singular scope overrides Kakao defaults; options.scopes would only append to them.
export const KAKAO_AUTH_QUERY_PARAMS = {
  prompt: "select_account",
  scope: "account_email",
} as const;