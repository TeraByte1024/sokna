import { SetlistPanel } from "@/components/setlists/setlist-panel";
import { SiteLayout } from "@/components/site-layout";
import { Loader2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "선곡회의",
  description: "후보곡 제안 및 선곡 회의",
};

export default function SetlistsPage() {
  return (
    <SiteLayout>
      <Suspense fallback={
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      }>
        <SetlistPanel />
      </Suspense>
    </SiteLayout>
  );
}
