import { redirect } from "next/navigation";
import { MembershipStep } from "@/components/membership-step";
import { getLoginDestination } from "@/lib/auth/login-flow";
import { getIsAdmin } from "@/lib/auth-admin";
import { hasCompletedMemberProfile } from "@/lib/member-application";
import { createClient } from "@/lib/supabase/server";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const next = getLoginDestination(typeof params.redirect === "string" ? params.redirect : null, "https://sokna.local");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?${new URLSearchParams({ onboarding: "membership", redirect: next })}`);
  }

  const [{ data: profile, error }, isAdmin] = await Promise.all([
    supabase.from("users").select("status, generation, part").eq("id", user.id).maybeSingle(),
    getIsAdmin(),
  ]);
  if (error) throw new Error("회원 권한 상태를 확인하지 못했습니다.");
  if (isAdmin || profile?.status === "approved" || hasCompletedMemberProfile(profile)) redirect(next);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm"><MembershipStep next={next} /></div>
    </div>
  );
}
