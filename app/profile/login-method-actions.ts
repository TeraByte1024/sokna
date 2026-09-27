"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLoginIdentities, getIdentityUnlinkErrorMessage } from "@/lib/auth/login-methods";
import { cookies, headers } from "next/headers";
import { getSocialProviderLabel, isSocialProvider, KAKAO_AUTH_QUERY_PARAMS, type SocialProvider } from "@/lib/auth/social-providers";
import { createClient } from "@/lib/supabase/server";
import {
  getIdentityLinkErrorMessage,
  IDENTITY_LINK_COOKIE,
  IDENTITY_LINK_MAX_AGE,
} from "@/lib/auth/identity-linking";

export async function startSocialIdentityLinkAction(
  expectedUserId: string,
  provider: SocialProvider,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isSocialProvider(provider)) {
    return { ok: false, error: "지원하지 않는 로그인 방식입니다." };
  }
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== expectedUserId) {
      return { ok: false, error: getIdentityLinkErrorMessage("session_changed") };
    }

    // Server Actions enforce same-origin requests. Never accept a client redirect URL.
    const origin = (await headers()).get("origin");
    if (!origin) return { ok: false, error: getIdentityLinkErrorMessage() };
    const url = new URL(origin);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      return { ok: false, error: getIdentityLinkErrorMessage() };
    }

    const nonce = randomUUID();
    const callback = new URL("/auth/callback", url.origin);
    callback.searchParams.set("intent", "link");
    callback.searchParams.set("link_state", nonce);
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: provider === "kakao" ? KAKAO_AUTH_QUERY_PARAMS : { prompt: "select_account" },
      },
    });
    if (error || !data.url) {
      return { ok: false, error: getIdentityLinkErrorMessage(error?.code) };
    }

    (await cookies()).set(IDENTITY_LINK_COOKIE, JSON.stringify({ userId: user.id, nonce, createdAt: Date.now() }), {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/auth/callback",
      maxAge: IDENTITY_LINK_MAX_AGE,
    });
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, error: getIdentityLinkErrorMessage() };
  }
}
export async function unlinkSocialIdentityAction(
  expectedUserId: string,
  identityId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  let providerLabel = "계정";
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== expectedUserId) {
      return { ok: false, error: getIdentityLinkErrorMessage("session_changed") };
    }

    const identity = user.identities?.find((item) => item.identity_id === identityId);
    if (!identity) {
      return { ok: false, error: getIdentityUnlinkErrorMessage("identity_not_found") };
    }
    if (!isSocialProvider(identity.provider)) {
      return { ok: false, error: "Google 또는 카카오 계정만 연결을 해제할 수 있습니다." };
    }
    providerLabel = getSocialProviderLabel(identity.provider);
    const method = getLoginIdentities(user).find((item) => item.id === identityId);
    if (!method?.canUnlink) {
      return {
        ok: false,
        error: method?.unlinkDisabledReason ?? getIdentityUnlinkErrorMessage("single_identity_not_deletable"),
      };
    }

    // Use the owned, freshly verified identity object, never client provider data.
    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) return { ok: false, error: getIdentityUnlinkErrorMessage(error.code) };
  } catch {
    return { ok: false, error: getIdentityUnlinkErrorMessage() };
  }

  // Unlink has committed. A refresh/cache failure must not invite a second deletion.
  let refreshFailed = false;
  try {
    const { error } = await supabase.auth.refreshSession();
    refreshFailed = Boolean(error);
  } catch {
    refreshFailed = true;
  }
  try {
    revalidatePath("/profile");
    revalidatePath("/admin/members");
  } catch {
    refreshFailed = true;
  }
  const success = providerLabel + " 계정 연결을 해제했습니다.";
  return {
    ok: true,
    message: refreshFailed
      ? success + " 최신 정보를 보려면 페이지를 새로고침해 주세요."
      : success,
  };
}