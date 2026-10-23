import { PublicLegalDocument, publicLegalMetadata } from "@/components/public-legal-document";

export const metadata = publicLegalMetadata("terms");

export default function TermsPage() { return <PublicLegalDocument kind="terms" />; }
