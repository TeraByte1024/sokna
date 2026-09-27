import type { SocialProvider } from "@/lib/auth/social-providers";

/** Public Auth settings avoid navigating to an unconfigured OAuth provider. */
export async function isSocialProviderEnabled(provider: SocialProvider): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicKey) throw new Error("Auth settings unavailable");

  const response = await fetch(new URL("auth/v1/settings", url.endsWith("/") ? url : url + "/"), {
    headers: { apikey: publicKey },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Auth settings unavailable");

  const settings = await response.json() as { external?: Partial<Record<SocialProvider, boolean>> };
  return settings.external?.[provider] === true;
}