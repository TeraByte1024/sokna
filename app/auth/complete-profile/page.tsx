import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompleteProfileForm } from "./complete-profile-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "부원 정보 등록 - 소크나",
  description: "소크나 부원 인증을 위한 기수 및 세션 정보 등록",
};

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인되지 않은 사용자는 로그인 화면으로 리다이렉트
  if (!user) {
    redirect("/auth/login");
  }

  // 기존 프로필 조회
  const { data: profile } = await supabase
    .from("users")
    .select("name, generation, part, status")
    .eq("id", user.id)
    .maybeSingle();

  // 이미 기수와 세션이 입력되어 있고 승인 대기 또는 완료 상태라면 홈으로
  if (profile?.generation && profile?.part) {
    redirect("/");
  }

  const initialName =
    profile?.name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "";

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-lg">
        <CompleteProfileForm
          initialName={initialName}
          email={user.email}
        />
      </div>
    </div>
  );
}
