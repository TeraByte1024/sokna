import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { getLoginDestination, getMembershipStepUrl } from "@/lib/auth/login-flow";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = getLoginDestination(searchParams.get("next"), origin);

  if (code || (token_hash && type)) {
    const supabase = await createClient();

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: token_hash! });
    if (!error) {
      if (type === "recovery") redirect("/auth/update-password");
      if (code || type === "signup" || type === "email" || searchParams.get("onboarding") === "membership") {
        redirect(getMembershipStepUrl(next, origin));
      }
      redirect(next);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/auth/error?error=${encodeURIComponent("이메일 인증에 실패했습니다. 인증 링크를 다시 확인해 주세요.")}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token hash or type`);
}
