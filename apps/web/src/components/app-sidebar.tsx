"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Archive,
  Bot,
  Boxes,
  Bug,
  ClipboardList,
  Gauge,
  Globe2,
  History,
  KeyRound,
  LockKeyhole,
  Radar,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  UserCog,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Gauge },
      { label: "Attack Surface", href: "/dashboard?view=surface", icon: Boxes },
      { label: "Scan History", href: "/dashboard?view=scans", icon: History },
    ],
  },
  {
    label: "Detection",
    items: [
      { label: "Programs", href: "/dashboard?view=programs", icon: ClipboardList },
      { label: "Threat Exposure", href: "/dashboard?view=findings", icon: ShieldAlert },
      { label: "API Discovery", href: "/dashboard?panel=radar", icon: Radar },
      { label: "Incidents", href: "/dashboard?view=scans&status=failed", icon: AlertTriangle },
      { label: "Findings", href: "/dashboard?view=findings", icon: Bug },
    ],
  },
  {
    label: "Controls",
    items: [
      { label: "IP Lists", href: "/dashboard?ips=true", icon: Globe2 },
      { label: "Rules", href: "/dashboard?view=programs", icon: ClipboardList },
      { label: "Credentials", href: "/dashboard?credentials=true", icon: KeyRound },
      { label: "BOLA Protection", href: "/dashboard?bola=true", icon: LockKeyhole },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();
  const adminHref = process.env.NEXT_PUBLIC_ADMIN_APP_URL || "http://localhost:3001";
  const activeView = searchParams.get("view");
  const activePanel = searchParams.get("panel");

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 flex w-[280px] flex-col border-r border-white/8 bg-[#070a0a] text-zinc-300">
      <div className="flex h-[76px] items-center px-6">
        <Link href="/dashboard" className="group flex items-center gap-3">
          <Image src="/logo-mark.svg" alt="" width={36} height={36} priority className="h-9 w-9 rounded-md" />
          <div>
            <p className="text-[15px] font-semibold leading-none text-zinc-50">ScanAI</p>
            <p className="mt-1 text-[10px] font-medium uppercase text-emerald-300/60">Exposure Command</p>
          </div>
        </Link>
      </div>

      <div className="px-4">
        <div className="flex h-10 items-center gap-2 rounded-md border border-white/8 bg-white/[0.035] px-3 text-zinc-500">
          <Search className="h-4 w-4" />
          <span className="text-sm">Search telemetry</span>
          <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">⌘K</span>
        </div>
      </div>

      <nav className="mt-5 flex-1 overflow-y-auto px-3 pb-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase text-zinc-600">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const itemUrl = new URL(item.href, "http://scanai.local");
                const itemView = itemUrl.searchParams.get("view");
                const itemPanel = itemUrl.searchParams.get("panel");
                const active =
                  pathname === itemUrl.pathname &&
                  (itemView ? activeView === itemView : itemPanel ? activePanel === itemPanel : !activeView && !activePanel);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                      active
                        ? "border border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                        : "text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active && "text-emerald-300")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase text-zinc-600">
              Administration
            </p>
            <Link
              href={adminHref}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                "text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200"
              )}
            >
              <UserCog className="h-4 w-4" />
              Admin
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-white/8 p-4">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            { icon: Activity, label: "Live" },
            { icon: Bot, label: "Bots" },
            { icon: Archive, label: "Logs" },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                className="flex h-11 flex-col items-center justify-center gap-1 rounded-md border border-white/8 bg-white/[0.03] text-[10px] font-medium text-zinc-500 transition-colors hover:border-white/14 hover:text-zinc-200"
                title={item.label}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
        <Link
          href="/settings"
          className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-white/[0.045] hover:text-zinc-200"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <div className="mt-3 flex items-center gap-2 rounded-md border border-white/8 bg-emerald-300/[0.04] px-3 py-2">
          <Shield className="h-4 w-4 text-emerald-300" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-200">Guard mode</p>
            <p className="truncate text-[10px] text-zinc-500">Continuous reconnaissance</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
