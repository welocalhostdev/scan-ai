import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { AuthGate } from "@/components/auth-gate";

function AppShellFallback() {
  return (
    <div className="flex min-h-screen flex-col bg-[#070808]">
      <div className="h-[73px] border-b border-white/8 bg-[#070808]" />
      <div className="flex flex-1 items-center justify-center text-sm font-semibold text-zinc-500">
        Checking session...
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-full flex-col bg-[#070808] [font-family:var(--font-sofia-sans),system-ui,sans-serif]">
      <Suspense fallback={<AppShellFallback />}>
        <AuthGate>
          <AppHeader />
          <main className="app-main-shell flex-1 overflow-auto bg-[#070808]">
            {children}
          </main>
        </AuthGate>
      </Suspense>
    </div>
  );
}
