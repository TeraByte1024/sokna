import { PublicLegalDocument, publicLegalMetadata } from "@/components/public-legal-document";

export const metadata = publicLegalMetadata("privacy");

export default function PrivacyPage() { return <PublicLegalDocument kind="privacy" />; }
