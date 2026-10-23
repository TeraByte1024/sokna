import { createClient } from "@/lib/supabase/server";
import { hasCompletedMemberProfile } from "@/lib/member-application";
import { getMembershipStepUrl } from "@/lib/auth/login-flow";
import { cookies } from "next/headers";
import {
  getIdentityLinkErrorCode,
  getSafeAuthNext,
  IDENTITY_LINK_COOKIE,
  readIdentityLinkContext,
} from "@/lib/auth/identity-linking";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordSignupConsent } from "@/lib/record-signup-consent";
import { readSignupConsent, signSignupConsent, SIGNUP_CONSENT_COOKIE } from "@/lib/signup-consent";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeAuthNext(searchParams.get("next"), origin);

  if (searchParams.get("intent") === "link") {
    const cookieStore = await cookies();
    const context = readIdentityLinkContext(cookieStore.get(IDENTITY_LINK_COOKIE)?.value);
    cookieStore.set(IDENTITY_LINK_COOKIE, "", { path: "/auth/callback", maxAge: 0 });
    const finish = (result: string) => {
      const destination = new URL("/profile", origin);
      destination.searchParams.set("identity_link", result);
      return NextResponse.redirect(destination);
    };

    if (!context || context.nonce !== searchParams.get("link_state")) {
      return finish("session_changed");
    }

    try {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || user?.id !== context.userId) return finish("session_changed");

      if (searchParams.has("error") || searchParams.has("error_code")) {
        return finish(getIdentityLinkErrorCode(searchParams.get("error_code") ?? searchParams.get("error")));
      }
      if (!code) return finish("failed");

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return finish(getIdentityLinkErrorCode(error.code));
      if (data.user?.id !== context.userId) {
        await supabase.auth.signOut({ scope: "local" });
        return finish("session_changed");
      }
      return finish("success");
    } catch {
      return finish("failed");
    }
  }

  if (code) {
    const consentState = searchParams.get("consent_state");
    const consentCookie = consentState ? (await cookies()).get(SIGNUP_CONSENT_COOKIE)?.value : undefined;
    const consentTicket = readSignupConsent(consentCookie);
    if (consentState && (!consentTicket || !["google", "kakao"].includes(consentTicket.method) ||
      consentCookie?.split(".")[1] !== consentState || Date.now() - consentTicket.acceptedAt > 3600_000)) {
      return NextResponse.redirect(new URL(`/auth/sign-up?${new URLSearchParams({ redirect: next })}`, origin));
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (consentState) {
        try {
          const recorded = await recordSignupConsent(data.user, consentCookie);
          if (!recorded) throw new Error("Invalid signup consent");
          (await cookies()).set(SIGNUP_CONSENT_COOKIE,
            recorded.preview ? signSignupConsent({ ...recorded.ticket, userId: data.user.id }) : "", {
              httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: recorded.preview ? 3600 : 0,
            });
        } catch {
          await supabase.auth.signOut({ scope: "local" });
          return NextResponse.redirect(new URL("/auth/error?error=약관 동의 내역을 저장하지 못했습니다. 다시 로그인해 주세요.", origin));
        }
      }
      if (searchParams.get("intent") === "signup") {
        return NextResponse.redirect(new URL(getMembershipStepUrl(next, origin), origin));
      }
      if (searchParams.get("intent") === "join") {
        const { data: profile } = await supabase
          .from("users")
          .select("id, generation, part, status")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profile?.status !== "approved" && !hasCompletedMemberProfile(profile)) {
          return NextResponse.redirect(`${origin}/auth/complete-profile`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error?error=OAuth 인증에 실패했습니다.`);
}
