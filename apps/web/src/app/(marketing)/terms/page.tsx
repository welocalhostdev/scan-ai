import { LegalDocumentPage } from "@/components/legal-document-page";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: "By accessing or using ScanAI, you agree to be bound by these Terms of Service. Our platform provides automated security scanning and analysis for engineering teams.",
  },
  {
    title: "2. Authorized Use",
    body: "You represent and warrant that you have the legal authority to scan the targets you submit to ScanAI. Unauthorized scanning of third-party assets without explicit consent is prohibited and may violate local laws.",
  },
  {
    title: "3. Service Limitations",
    body: "ScanAI is an automated tool. While we strive for high accuracy, automated scans cannot replace professional manual penetration testing. We are not liable for missed vulnerabilities or false positives.",
  },
  {
    title: "4. Data Privacy",
    body: "Your scan reports and target data are treated as confidential. We use industry-standard encryption to protect your information. Please refer to our Privacy Policy for more details.",
  },
];

export default function TermsPage() {
  return (
    <LegalDocumentPage
      badge="Legal"
      title="Terms of Service"
      intro="The operating terms for ScanAI accounts, target authorization, automated scans, and report usage."
      updated="May 5, 2026"
      sections={sections}
    />
  );
}
