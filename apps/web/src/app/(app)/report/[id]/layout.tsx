import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Security Report",
  description: "ScanAI security report and PDF handoff.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.ico",
  },
};

export default function ReportLayout({ children }: { children: ReactNode }) {
  return children;
}
