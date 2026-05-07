"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/admin": "Admin",
};

export function AppHeader() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const router = useRouter();

  const title = PAGE_TITLES[pathname] || "ScanAI";

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="h-16 bg-white border-b border-ink-black/5 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-lg font-semibold tracking-tight text-ink-black">{title}</h1>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-[13px] font-medium text-ink-black/50 hover:text-ink-black hover:bg-ink-black/5 rounded-full px-4"
        >
          Sign Out
        </Button>
      </div>
    </header>
  );
}
