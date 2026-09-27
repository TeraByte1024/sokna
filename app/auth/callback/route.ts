import { createClient } from "@/lib/supabase/server";
import { hasCompletedMemberProfile } from "@/lib/member-application";
import { cookies } from "next/headers";
import {
  getIdentityLinkErrorCode,
  getSafeAuthNext,
  IDENTITY_LINK_COOKIE,
  readIdentityLinkContext,
} from "@/lib/auth/identity-linking";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("users")
        .select("id, generation, part, status")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!hasCompletedMemberProfile(profile)) {
        return NextResponse.redirect(`${origin}/auth/complete-profile`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error?error=OAuth 인증에 실패했습니다.`);
}