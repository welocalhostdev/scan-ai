"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

const navItems = [
  { label: "Product", href: "/product/attack-surface", dropdown: true },
  { label: "Teams", href: "/teams/startup", dropdown: true },
  { label: "Resources", href: "/resources/security-guide", dropdown: true },
];

export function MarketingNavbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/20 bg-[#080808] text-white">
      <div className="grid h-[76px] grid-cols-[1fr_auto] border-b border-white/0 lg:grid-cols-[minmax(260px,0.48fr)_1fr_minmax(300px,0.48fr)]">
        <div className="flex items-center border-white/18 px-5 lg:border-r lg:px-14">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo-mark.svg" alt="" width={36} height={36} priority className="h-9 w-9" />
            <span className="text-3xl font-semibold tracking-tight">ScanAI</span>
          </Link>
        </div>

        <nav className="hidden items-center justify-center gap-10 lg:flex">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} className="inline-flex items-center gap-1 text-[15px] font-medium text-white/82 transition-colors hover:text-white">
              {item.label}
              {item.dropdown && <ChevronDown className="h-4 w-4" />}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center justify-end gap-8 border-l border-white/18 px-14 lg:flex">
          {loading ? (
            <div className="h-10 w-28 animate-pulse bg-white/10" />
          ) : user ? (
            <>
              <Link href="/dashboard" className="text-[15px] font-medium text-white/82 transition-colors hover:text-white">
                Dashboard
              </Link>
              <button onClick={handleLogout} className="h-11 bg-white px-6 text-[15px] font-medium text-black transition-colors hover:bg-zinc-200">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-[15px] font-medium text-white/82 transition-colors hover:text-white">
                Login
              </Link>
              <Link href="/signup" className="h-11 bg-white px-6 py-2.5 text-[15px] font-medium text-black transition-colors hover:bg-zinc-200">
                Start scanning
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="flex h-[76px] w-[76px] items-center justify-center border-l border-white/18 text-white lg:hidden"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/18 bg-[#080808] px-5 py-5 lg:hidden">
          <div className="grid gap-4">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMobileOpen(false)} className="text-base font-medium text-white/82">
                {item.label}
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-3 border-t border-white/14 pt-4">
              {user ? (
                <>
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="border border-white/20 px-4 py-3 text-center text-sm font-medium text-white">
                    Dashboard
                  </Link>
                  <button onClick={() => { handleLogout(); setMobileOpen(false); }} className="bg-white px-4 py-3 text-sm font-medium text-black">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileOpen(false)} className="border border-white/20 px-4 py-3 text-center text-sm font-medium text-white">
                    Login
                  </Link>
                  <Link href="/signup" onClick={() => setMobileOpen(false)} className="bg-white px-4 py-3 text-center text-sm font-medium text-black">
                    Start scanning
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
