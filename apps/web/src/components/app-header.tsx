"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Boxes,
  ClipboardList,
  ChevronDown,
  Command,
  FileText,
  Gauge,
  LogOut,
  Search,
  Settings,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge, view: null },
  { label: "Surface", href: "/dashboard?view=surface", icon: Boxes, view: "surface" },
  { label: "Programs", href: "/dashboard?view=programs", icon: ClipboardList, view: "programs" },
  { label: "Findings", href: "/dashboard?view=findings", icon: ShieldAlert, view: "findings" },
  { label: "Reports", href: "/dashboard?view=reports", icon: FileText, view: "reports" },
];

const PRIMARY_VIEWS = ["surface", "programs", "findings", "reports"];
const UTILITY_PANELS = ["notifications", "account", "search"];
const DASHBOARD_THEME_KEY = "scanai-dashboard-theme";

function UtilityDrawer({
  panel,
  closeHref,
  user,
  onLogout,
}: {
  panel: string | null;
  closeHref: string;
  user: { name?: string; email?: string; role?: string } | null;
  onLogout: () => Promise<void>;
}) {
  if (!panel || !UTILITY_PANELS.includes(panel)) return null;

  const title = {
    notifications: "Notifications",
    account: "Account",
    search: "Command search",
  }[panel];

  return (
    <div className="fixed inset-x-0 bottom-0 top-[76px] z-50 bg-black/45 backdrop-blur-sm">
      <Link href={closeHref} aria-label="Close drawer" className="absolute inset-0 cursor-default" />
      <aside className="animate-drawer-slide-in absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-white/10 bg-[#0d1011] text-zinc-100 shadow-[-24px_0_80px_rgba(0,0,0,0.42)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-black/24 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#bdeeff]/70">Workspace utility</p>
            <h2 className="text-xl font-semibold text-zinc-50">{title}</h2>
          </div>
          <Link
            href={closeHref}
            className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {panel === "account" && (
            <div className="rounded-[4px] border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-zinc-100">{user?.name || "Operator"}</p>
              <p className="mt-1 text-xs text-zinc-500">{user?.email || "signed in"}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[#bdeeff]/70">{user?.role || "user"}</p>
              <button
                type="button"
                onClick={onLogout}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-[3px] border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.075]"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}

          {panel !== "account" && (
            <div className="rounded-[4px] border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-400">
              Open the dashboard for the full {title?.toLowerCase()} workspace. This quick drawer keeps you on the current page.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePanel = searchParams.get("panel");
  const viewParam = searchParams.get("view");
  const legacyView = PRIMARY_VIEWS.includes(activePanel || "") ? activePanel : null;
  const activeView = viewParam || legacyView;
  const utilityView = PRIMARY_VIEWS.includes(viewParam || "") ? viewParam : null;

  const utilityHref = (panel: string) => {
    if (panel === "settings") return "/settings";
    if (pathname !== "/dashboard") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("panel", panel);
      return `${pathname}?${params.toString()}`;
    }

    const params = new URLSearchParams();
    if (utilityView) params.set("view", utilityView);
    params.set("panel", panel);
    return `/dashboard?${params.toString()}`;
  };

  const drawerCloseHref = () => {
    if (pathname === "/dashboard") return utilityView ? `/dashboard?view=${utilityView}` : "/dashboard";
    const params = new URLSearchParams(searchParams.toString());
    params.delete("panel");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  useEffect(() => {
    const applyTheme = (theme: string | null) => {
      document.documentElement.dataset.scanaiDashboardTheme = theme === "light" ? "light" : "dark";
    };
    applyTheme(window.localStorage.getItem(DASHBOARD_THEME_KEY));

    const handleThemeChange = (event: Event) => {
      applyTheme((event as CustomEvent<string>).detail);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DASHBOARD_THEME_KEY) applyTheme(event.newValue);
    };

    window.addEventListener("scanai-dashboard-theme", handleThemeChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("scanai-dashboard-theme", handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <>
    <header className="app-header-shell sticky top-0 z-40 border-b border-white/10 bg-[#080909]/94 px-4 text-zinc-100 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex h-[76px] max-w-[1780px] items-center gap-0">
        <Link href="/dashboard" className="group flex h-full shrink-0 items-center gap-3 border-x border-white/10 px-4 transition-colors hover:bg-white/[0.04]">
          <Image src="/logo-mark.svg" alt="" width={36} height={36} priority className="h-9 w-9 rounded-[3px]" />
          <div className="hidden leading-none sm:block">
            <p className="text-sm font-semibold tracking-tight text-zinc-50">ScanAI</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/46">Command desk</p>
          </div>
        </Link>

        <nav className="hidden h-full min-w-0 shrink-0 items-center lg:flex" aria-label="Primary">
          {PRIMARY_NAV.map((item) => {
            const active = pathname === "/dashboard" && (item.view ? activeView === item.view : !activeView);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-full items-center gap-2 border-r border-white/10 px-4 text-sm font-semibold transition-colors",
                  active
                    ? "bg-white/[0.08] text-white after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:bg-[#4fa5b6]"
                    : "text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link href={utilityHref("search")} className={cn(
          "ml-3 hidden h-11 w-full max-w-[380px] items-center gap-3 rounded-[3px] border px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors 2xl:flex",
          activePanel === "search"
            ? "border-[#4fa5b6]/40 bg-[#4fa5b6]/12 text-[#d9f7ff]"
            : "border-white/8 bg-black/35 text-zinc-500 hover:border-white/14 hover:text-zinc-300"
        )}
          aria-current={activePanel === "search" ? "page" : undefined}
        >
          <Search className="h-4 w-4" />
          <span className="truncate text-sm">Search host, CVE, finding...</span>
          <span className="ml-auto flex items-center gap-1 rounded-[2px] border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            <Command className="h-3 w-3" /> K
          </span>
        </Link>

        <div className="ml-auto flex h-full shrink-0 items-center">
          <Link
            href={utilityHref("notifications")}
            className={cn(
              "hidden h-full w-14 items-center justify-center border-l border-white/10 transition-colors sm:flex",
              activePanel === "notifications"
                ? "bg-[#ef5a2a]/14 text-orange-100"
                : "text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100"
            )}
            title="Notifications"
            aria-current={activePanel === "notifications" ? "page" : undefined}
          >
            <Bell className="h-4 w-4" />
          </Link>
          <Link
            href="/settings"
            className={cn(
              "hidden h-full w-14 items-center justify-center border-l border-white/10 transition-colors sm:flex",
              pathname === "/settings"
                ? "bg-white/[0.09] text-zinc-100"
                : "text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100"
            )}
            title="Settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings className="h-4 w-4" />
          </Link>
          <Link href={utilityHref("account")} className={cn(
            "flex h-full items-center gap-3 border-l border-white/10 px-4 transition-colors",
            activePanel === "account"
              ? "bg-[#4fa5b6]/12"
              : "hover:bg-white/[0.055]"
          )}
            aria-current={activePanel === "account" ? "page" : undefined}
          >
            <div className="app-header-avatar flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#4fa5b6]/30 bg-[#d9f7ff] text-[#123f4d]">
              {user?.name ? (
                <span className="text-xs font-semibold">{user.name[0].toUpperCase()}</span>
              ) : (
                <UserRound className="h-4 w-4" />
              )}
            </div>
            <div className="hidden min-w-0 xl:block">
              <p className="max-w-32 truncate text-xs font-semibold text-zinc-100">{user?.name || "Operator"}</p>
              <p className="max-w-32 truncate text-[10px] text-zinc-500">{user?.email || "signed in"}</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-zinc-500 xl:block" />
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="app-header-logout flex h-full w-14 items-center justify-center border-l border-r border-white/10 bg-transparent text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-zinc-100"
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
    {pathname !== "/dashboard" && (
      <UtilityDrawer panel={activePanel} closeHref={drawerCloseHref()} user={user} onLogout={handleLogout} />
    )}
    </>
  );
}
