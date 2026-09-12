import { SiteLayout } from "@/components/site-layout";
import { AnniversaryInner } from "./anniversary-inner";
import { ANNIVERSARY_CONFIG } from "@/lib/anniversary";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: ANNIVERSARY_CONFIG.metadata.title,
  description: ANNIVERSARY_CONFIG.metadata.description,
};

export default function AnniversaryPage() {
  return (
    <SiteLayout>
      <AnniversaryInner />
    </SiteLayout>
  );
}
