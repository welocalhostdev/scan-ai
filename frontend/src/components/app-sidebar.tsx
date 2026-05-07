"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "New Scan",
    href: "/dashboard?scan=true",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8m-4-4h8" />
      </svg>
    ),
  },
  {
    label: "History",
    href: "/dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 3v5h5" />
        <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
        <path d="M12 7v5l4 2" />
      </svg>
    ),
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, isAdmin } = useAuth();

  const isActive = (href: string) => {
    if (href.includes("?")) {
      return pathname === href.split("?")[0];
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-ink-black/5 flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-ink-black/5">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-ink-black flex items-center justify-center transition-transform group-hover:scale-110">
            <svg className="w-5 h-5 text-canvas-cream" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight text-ink-black">ScanAI</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        <p className="px-3 text-[10px] font-bold tracking-widest uppercase text-ink-black/30 mb-3">
          Platform
        </p>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
              isActive(item.href)
                ? "bg-ink-black text-canvas-cream shadow-sm"
                : "text-ink-black/60 hover:bg-ink-black/5 hover:text-ink-black"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <p className="px-3 text-[10px] font-bold tracking-widest uppercase text-ink-black/30 mt-6 mb-3">
              Administration
            </p>
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                pathname === "/admin"
                  ? "bg-ink-black text-canvas-cream shadow-sm"
                  : "text-ink-black/60 hover:bg-ink-black/5 hover:text-ink-black"
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Admin
            </Link>
          </>
        )}
      </nav>

      {/* User Card */}
      {user && (
        <div className="p-4 border-t border-ink-black/5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-lifted-cream border border-ink-black/5">
            <div className="w-9 h-9 rounded-full bg-ink-black flex items-center justify-center text-[11px] font-bold text-canvas-cream shrink-0">
              {user.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-black truncate">{user.name}</p>
              <p className="text-[10px] text-slate-gray truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
