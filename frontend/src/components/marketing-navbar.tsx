"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function MarketingNavbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-ink-black/5 bg-canvas-cream/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-ink-black flex items-center justify-center transition-transform group-hover:scale-110">
            <svg className="w-5 h-5 text-canvas-cream" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight text-ink-black">ScanAI</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/#features" className="text-[13px] font-medium text-ink-black/60 hover:text-ink-black transition-colors">
            Features
          </Link>
          <Link href="/#how-it-works" className="text-[13px] font-medium text-ink-black/60 hover:text-ink-black transition-colors">
            How it works
          </Link>
          <Link href="/login" className="text-[13px] font-medium text-ink-black/60 hover:text-ink-black transition-colors">
            Pricing
          </Link>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="w-20 h-9 rounded-full bg-dust-taupe/20 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="text-[13px] font-medium text-ink-black/60 hover:text-ink-black hover:bg-ink-black/5 rounded-full px-4">
                  Dashboard
                </Button>
              </Link>
              <Button
                variant="default"
                size="sm"
                onClick={handleLogout}
                className="text-[13px] font-medium rounded-full px-4"
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-[13px] font-medium text-ink-black/60 hover:text-ink-black hover:bg-ink-black/5 rounded-full px-4">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="text-[13px] font-bold rounded-full px-4 bg-ink-black text-canvas-cream hover:bg-ink-black/90">
                  Get Started
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-ink-black"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-ink-black/5 bg-canvas-cream px-6 py-4 space-y-3">
          <Link href="/#features" className="block text-sm font-medium text-ink-black/60" onClick={() => setMobileOpen(false)}>
            Features
          </Link>
          <Link href="/#how-it-works" className="block text-sm font-medium text-ink-black/60" onClick={() => setMobileOpen(false)}>
            How it works
          </Link>
          <Link href="/login" className="block text-sm font-medium text-ink-black/60" onClick={() => setMobileOpen(false)}>
            Pricing
          </Link>
          <div className="pt-2 border-t border-ink-black/5 flex gap-2">
            {user ? (
              <>
                <Link href="/dashboard" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full rounded-full">Dashboard</Button>
                </Link>
                <Button variant="default" size="sm" className="flex-1 rounded-full" onClick={() => { handleLogout(); setMobileOpen(false); }}>
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full rounded-full">Log in</Button>
                </Link>
                <Link href="/signup" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button size="sm" className="w-full rounded-full bg-ink-black text-canvas-cream">Get Started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
