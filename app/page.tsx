import { Landing } from "@/components/landing";
import { SiteLayout } from "@/components/site-layout";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <SiteLayout>
      <Landing isLoggedIn={Boolean(data?.claims)} />
    </SiteLayout>
  );
}
