import type { Metadata } from "next";
import { Geist_Mono, Sofia_Sans } from "next/font/google";
import { ClientProviders } from "@/components/client-providers";
import "./globals.css";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_ADMIN_APP_URL || "http://localhost:3001"),
  title: {
    default: "ScanAI Admin",
    template: "%s | ScanAI Admin",
  },
  description: "ScanAI platform administration console.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sofiaSans.variable} ${geistMono.variable} h-full antialiased font-sans`}>
      <body className="min-h-full bg-[#090b0d] text-zinc-100">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
