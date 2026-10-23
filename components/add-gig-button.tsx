import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { getGigViewer } from "@/lib/gig-viewer";

export async function AddGigButton() {
  const { isAdmin } = await getGigViewer();
  if (!isAdmin) return null;
  return (
    <Button asChild className="shadow-sm font-semibold">
      <Link href="/gigs/new">
        <Plus className="size-4 mr-1.5" /> 공연 추가
      </Link>
    </Button>
  );
}
