import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // 구글 로그인 성공 후 public.users 레코드 확인
      const { data: profile } = await supabase
        .from("users")
        .select("id, generation, part, status")
        .eq("id", data.user.id)
        .maybeSingle();

      // 만약 아직 기수/세션 정보가 없다면 (신규 구글 로그인 가입자)
      // 프로필 입력 페이지로 이동시키거나 기본 안내
      if (!profile?.generation || !profile?.part) {
        return NextResponse.redirect(`${origin}/auth/complete-profile`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 오류 발생 시
  return NextResponse.redirect(`${origin}/auth/error?error=OAuth 인증에 실패했습니다.`);
}
