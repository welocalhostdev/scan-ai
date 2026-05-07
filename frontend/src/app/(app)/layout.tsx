import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 ml-64">
        <AppHeader />
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
