import { redirect } from "next/navigation";
import { AdminMenuDrawer, AdminNav } from "@/components/admin/admin-nav";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { getIsAdmin } from "@/lib/auth-admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getIsAdmin())) redirect("/");

  return (
    <SiteLayout headerLeading={<AdminMenuDrawer />}>
      <PageContainer className="relative gap-0 px-4 py-6 sm:px-6 md:p-10">
        <AdminNav />
        {children}
      </PageContainer>
    </SiteLayout>
  );
}
