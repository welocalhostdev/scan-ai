import type { ReactNode } from "react";
import Link from "next/link";
import { MarketingNavbar } from "@/components/marketing-navbar";
import { MarketingFooter } from "@/components/marketing-footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <MarketingNavbar />
      <div className="flex-1 pt-24">{children}</div>
      <MarketingFooter />
    </div>
  );
}
