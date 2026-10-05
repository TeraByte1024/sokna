import { notFound, redirect } from "next/navigation";
import { getIsAdmin } from "@/lib/auth-admin";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "공연 관리" };

export default async function GigEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gigId = Number(id);
  if (!Number.isSafeInteger(gigId) || gigId <= 0) notFound();
  if (!(await getIsAdmin())) redirect(`/gigs/${gigId}`);
  redirect(`/admin/gigs/${gigId}#gig-basic-info`);
}
