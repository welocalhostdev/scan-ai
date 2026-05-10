import { LegalDocumentPage } from "@/components/legal-document-page";

const sections = [
  {
    title: "1. Information We Collect",
    body: "We collect information necessary to provide our scanning services, including your email address, name, and the URLs you submit for analysis.",
  },
  {
    title: "2. How We Use Data",
    body: "Data is used primarily to generate security reports and manage your account. We may use anonymized findings to improve our security detection algorithms.",
  },
  {
    title: "3. Data Security",
    body: "We use industry-standard encryption for scan data at rest and in transit. Our infrastructure is monitored for unauthorized access.",
  },
  {
    title: "4. Your Rights",
    body: "You have the right to access, export, or delete your account data at any time. Contact support if you wish to exercise these rights.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      badge="Privacy"
      title="Privacy Policy"
      intro="How ScanAI handles account information, submitted targets, scan evidence, and report data."
      updated="May 5, 2026"
      sections={sections}
    />
  );
}
