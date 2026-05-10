import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app-header";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-full flex-col bg-[#070808] [font-family:var(--font-sofia-sans),system-ui,sans-serif]">
      <Suspense fallback={<div className="h-[73px] border-b border-white/8 bg-[#070808]" />}>
        <AppHeader />
      </Suspense>
      <main className="app-main-shell flex-1 overflow-auto bg-[#070808]">
        {children}
      </main>
    </div>
  );
}
