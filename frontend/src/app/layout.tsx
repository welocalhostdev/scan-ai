import type { Metadata } from "next";
import { Sofia_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/client-providers";

const sofiaSans = Sofia_Sans({
  variable: "--font-sofia-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "ScanAI — AI-Powered Security Scanner",
    template: "%s | ScanAI"
  },
  description:
    "Enterprise-grade vulnerability intelligence for modern engineering teams. Find vulnerabilities before they find you with AI-powered scanning.",
  keywords: [
    "security scanner",
    "vulnerability scanner",
    "AI security",
    "web security",
    "B2B security",
    "SaaS security",
    "CVE scanner",
  ],
  authors: [{ name: "ScanAI Team" }],
  openGraph: {
    title: "ScanAI — AI-Powered Security Scanner",
    description: "Deep security intelligence in minutes. Find vulnerabilities before they find you.",
    type: "website",
    siteName: "ScanAI",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScanAI — AI-Powered Security Scanner",
    description: "Deep security intelligence in minutes. AI-powered scans with actionable remediation.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sofiaSans.variable} ${geistMono.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-500">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}

