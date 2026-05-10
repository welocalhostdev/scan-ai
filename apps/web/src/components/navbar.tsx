"use client";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { user, loading, logout, isAdmin } = useAuth();
  const router = useRouter();
  const adminHref = process.env.NEXT_PUBLIC_ADMIN_APP_URL || "http://localhost:3001";

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-6 pointer-events-none">
      <nav className={cn(
        "w-full max-w-6xl h-16 bg-white/90 backdrop-blur-md rounded-pill shadow-[0_4px_24px_rgba(0,0,0,0.04)]",
        "flex items-center justify-between px-8 pointer-events-auto border border-white/20"
      )}>
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <Image src="/logo-mark.svg" alt="" width={32} height={32} priority className="h-8 w-8 rounded-md transition-transform group-hover:scale-105" />
          <span className="font-bold text-xl tracking-tight text-ink-black">ScanAI</span>
        </Link>

        {/* Center Links - Airy spacing */}
        <div className="hidden md:flex items-center gap-10">
          <Link href="/solutions" className="text-[13px] font-bold tracking-tight text-ink-black/50 hover:text-ink-black transition-colors">
            For Developers
          </Link>
          <Link href="/solutions" className="text-[13px] font-bold tracking-tight text-ink-black/50 hover:text-ink-black transition-colors">
            Security Intelligence
          </Link>
          {user && (
            <Link href="/dashboard" className="text-[13px] font-bold tracking-tight text-ink-black hover:text-signal-orange transition-colors flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-orange animate-pulse" />
              Console
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {loading ? (
            <div className="w-20 h-9 rounded-pill bg-dust-taupe/20 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link href={adminHref}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[11px] font-bold uppercase tracking-widest text-ink-black/40 hover:text-ink-black hover:bg-ink-black/5 rounded-pill px-4"
                  >
                    Admin
                  </Button>
                </Link>
              )}

              <div className="flex items-center gap-3 pl-1 pr-1 py-1 rounded-pill bg-white border border-ink-black/5 shadow-sm group cursor-default">
                <div className="w-8 h-8 rounded-full bg-ink-black flex items-center justify-center text-[10px] font-bold text-canvas-cream ring-4 ring-ink-black/5">
                  {user.name[0].toUpperCase()}
                </div>
                <div className="hidden lg:flex flex-col pr-4">
                   <span className="text-[11px] font-bold text-ink-black leading-tight">
                    {user.name}
                  </span>
                  <span className="text-[9px] font-medium text-slate-gray leading-tight">
                    {user.role === 'admin' ? 'Enterprise Admin' : 'Professional'}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-[11px] font-bold uppercase tracking-widest text-slate-gray hover:text-ink-black hover:bg-transparent px-4"
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button
                  id="nav-login-button"
                  variant="ghost"
                  size="sm"
                  className="text-sm font-medium rounded-pill px-6"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  id="nav-signup-button"
                  size="sm"
                  className="text-sm font-bold rounded-pill px-6 bg-ink-black text-canvas-cream hover:bg-ink-black/90"
                >
                  Get Started
                </Button>
              </Link>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
