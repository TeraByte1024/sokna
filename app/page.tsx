import { Landing } from "@/components/landing";
import { SiteLayout } from "@/components/site-layout";
import { getGigViewer } from "@/lib/gig-viewer";
import { canViewGig, getGigVisibility } from "@/lib/gig-visibility";
import { isNominationClosed } from "@/lib/nomination-deadline";
import { createClient } from "@/lib/supabase/server";

type GigViewer = Awaited<ReturnType<typeof getGigViewer>>;

async function getActiveNominationGig(viewer: GigViewer) {
  if (!viewer.user) return null;

  const supabase = await createClient();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const [gigsResult, performersResult] = await Promise.all([
    supabase
      .from("gigs")
      .select("id, title, meeting_date, visibility, is_public")
      .gt("meeting_date", today)
      .order("meeting_date", { ascending: true })
      .order("id", { ascending: true }),
    viewer.isAdmin
      ? Promise.resolve(null)
      : supabase.from("performers").select("gig_id").eq("user_id", viewer.user.id),
  ]);

  if (gigsResult.error || performersResult?.error) return null;

  const performerGigIds = new Set(
    (performersResult?.data ?? []).map(({ gig_id }) => gig_id),
  );

  return (
    gigsResult.data?.find(
      (gig) =>
        !isNominationClosed(gig.meeting_date, now) &&
        canViewGig(getGigVisibility(gig), viewer) &&
        (viewer.isAdmin || performerGigIds.has(gig.id)),
    ) ?? null
  );
}

export default async function Home() {
  const viewer = await getGigViewer();
  const activeNominationGig = await getActiveNominationGig(viewer);

  return (
    <SiteLayout>
      <Landing
        isLoggedIn={viewer.isLoggedIn}
        activeNominationGig={activeNominationGig}
      />
    </SiteLayout>
  );
}
