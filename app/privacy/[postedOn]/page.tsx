import { PublicLegalDocument, publicLegalMetadata } from "@/components/public-legal-document";
import { publicLegalDocuments } from "@/lib/public-legal-documents";

export const dynamicParams = false;
export function generateStaticParams() { return publicLegalDocuments("privacy").map(({ postedOn }) => ({ postedOn })); }
type Props = { params: Promise<{ postedOn: string }> };
export async function generateMetadata({ params }: Props) { return publicLegalMetadata("privacy", (await params).postedOn); }
export default async function PrivacyRevisionPage({ params }: Props) { return <PublicLegalDocument kind="privacy" postedOn={(await params).postedOn} />; }
