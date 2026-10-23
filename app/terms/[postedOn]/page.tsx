import { PublicLegalDocument, publicLegalMetadata } from "@/components/public-legal-document";
import { publicLegalDocuments } from "@/lib/public-legal-documents";

export const dynamicParams = false;
export function generateStaticParams() { return publicLegalDocuments("terms").map(({ postedOn }) => ({ postedOn })); }
type Props = { params: Promise<{ postedOn: string }> };
export async function generateMetadata({ params }: Props) { return publicLegalMetadata("terms", (await params).postedOn); }
export default async function TermsRevisionPage({ params }: Props) { return <PublicLegalDocument kind="terms" postedOn={(await params).postedOn} />; }
