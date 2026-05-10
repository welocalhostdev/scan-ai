"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingNavbar } from "@/components/marketing-navbar";

const authPaths = new Set(["/login", "/signup"]);

export function MarketingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = authPaths.has(pathname);

  return (
    <div className="flex min-h-full flex-col bg-[#f5f3ee] text-zinc-950">
      {!isAuthPage && <MarketingNavbar />}
      <div className="flex-1">{children}</div>
      {!isAuthPage && <MarketingFooter />}
    </div>
  );
}
