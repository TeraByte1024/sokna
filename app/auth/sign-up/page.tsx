import { redirect } from "next/navigation";
import { SignupFlow } from "@/components/signup-flow";
import { getLoginDestination, getMembershipStepUrl } from "@/lib/auth/login-flow";
import { createClient } from "@/lib/supabase/server";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ type?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const next = getLoginDestination(typeof params.redirect === "string" ? params.redirect : null, "https://sokna.local");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect(getMembershipStepUrl(next, "https://sokna.local"));

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-lg">
        <SignupFlow next={next} />
      </div>
    </div>
  );
}
