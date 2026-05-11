"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { GoogleAuthLink } from "@/components/google-auth-link";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

function LoginPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const visibleError = error ?? searchParams.get("error");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      router.push(nextPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mesh-grain-canvas relative min-h-screen overflow-hidden bg-[linear-gradient(90deg,rgba(79,165,182,0.2),rgba(245,243,238,0.98)_36%,rgba(239,90,42,0.14)),linear-gradient(90deg,rgba(20,20,19,0.07)_1px,transparent_1px),#f5f3ee] bg-[length:auto,72px_100%] px-4 py-8 text-[#141413] sm:px-6 sm:py-10 lg:px-10 lg:py-12">
      <div className="grain-noise absolute inset-0 opacity-35" />

      <Link href="/" className="relative z-10 mx-auto mb-8 flex max-w-6xl items-center gap-3">
        <Image src="/logo-mark.svg" alt="" width={36} height={36} priority className="h-9 w-9" />
        <span className="text-3xl font-semibold tracking-tight text-[#090909]">ScanAI</span>
      </Link>

      <div className="relative mx-auto grid max-w-6xl overflow-hidden rounded-[8px] border border-black/14 bg-[#fffefa]/92 shadow-[0_26px_90px_rgba(20,20,19,0.18)] backdrop-blur-xl lg:grid-cols-[0.96fr_1.04fr]">
        <section className="relative flex items-center border-black/14 bg-[#fffefa]/96 p-6 md:p-10 lg:border-r lg:p-12">
          <div className="mx-auto w-full max-w-[430px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-[3px] border border-black/12 bg-[#f2f0eb] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
              <ShieldCheck className="h-4 w-4 text-[#176b78]" />
              Secure access
            </div>

            <h1 className="max-w-md text-4xl font-semibold leading-[1.02] tracking-tight text-[#090909] md:text-5xl">
              Welcome back.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-zinc-600">
              Use Google for instant access, or continue with your operator credentials.
            </p>

            <div className="mt-7 space-y-5">
              <GoogleAuthLink next={nextPath} />
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                <span className="h-px flex-1 bg-black/10" />
                <span>or continue with email</span>
                <span className="h-px flex-1 bg-black/10" />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-zinc-800">
                  Email
                </label>
                <div className="flex h-12 items-center gap-3 rounded-[4px] border border-black/14 bg-[#f7f6f1] px-3 transition-colors focus-within:border-[#4fa5b6]/70 focus-within:ring-4 focus-within:ring-[#4fa5b6]/15">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white text-zinc-500 shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                    className="login-input h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-zinc-800">
                  Password
                </label>
                <div className="flex h-12 items-center gap-3 rounded-[4px] border border-black/14 bg-[#f7f6f1] px-3 transition-colors focus-within:border-[#4fa5b6]/70 focus-within:ring-4 focus-within:ring-[#4fa5b6]/15">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white text-zinc-500 shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
                    <LockKeyhole className="h-4 w-4" />
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={loading}
                    minLength={8}
                    autoComplete="current-password"
                    className="login-input h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="flex h-8 w-8 items-center justify-center rounded-[3px] text-zinc-500 transition-colors hover:bg-black/6 hover:text-zinc-950"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 text-sm">
                <label className="flex items-center gap-2 text-zinc-600">
                  <input type="checkbox" className="h-4 w-4 rounded-[2px] border-zinc-300 accent-[#4fa5b6]" />
                  Keep me signed in
                </label>
                <Link href="/signup" className="font-semibold text-zinc-950 hover:underline">
                  Need access?
                </Link>
              </div>

              {visibleError && (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{visibleError}</span>
                </div>
              )}

              <button
                id="login-submit-button"
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#0a0a09] text-sm font-semibold text-white transition-colors hover:bg-[#1d1d1b] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Authenticating..." : "Log in"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-zinc-600">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-zinc-950 hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </section>

        <section className="mesh-grain-dark relative hidden min-h-[560px] overflow-hidden bg-[linear-gradient(120deg,rgba(79,165,182,0.5),rgba(8,9,9,0.96)_48%,rgba(239,90,42,0.44)),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:auto,72px_100%] p-5 text-white lg:block">
          <div className="grain-noise absolute inset-0 opacity-28" />
          <div className="relative flex h-full flex-col justify-between rounded-[6px] border border-white/14 bg-black/28 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-[3px] border border-white/12 bg-white/10 px-3 py-1.5 font-mono text-xs text-zinc-200">
                <TerminalSquare className="h-3.5 w-3.5 text-[#bdeeff]" />
                scanai auth/session --verify
              </div>
              <h2 className="mt-10 max-w-lg text-5xl font-semibold leading-[1.02] tracking-tight">
                Security work starts here.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-zinc-300">
                Scan targets, review findings, and export clean remediation reports from one workspace.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-[3px] border border-white/12 bg-white/[0.055] px-3 py-2 text-sm text-zinc-300">
              <ShieldCheck className="h-4 w-4 text-[#bdeeff]" />
              Encrypted operator session
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
