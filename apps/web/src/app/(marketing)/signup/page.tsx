"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { requestSignupOtp } from "@/lib/api";
import { GoogleAuthLink } from "@/components/google-auth-link";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

  const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      if (!otpSent) {
        await requestSignupOtp(name, email, password, browserTimezone());
        setOtpSent(true);
        setNotice("Verification code sent. Check your email to finish signup.");
        return;
      }

      if (!otp.trim()) {
        setError("Enter the verification code sent to your email.");
        return;
      }

      await signup(name, email, password, otp, browserTimezone());
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signup failed.";
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

      <div className="relative mx-auto grid max-w-6xl overflow-hidden rounded-[8px] border border-black/14 bg-[#fffefa]/92 shadow-[0_26px_90px_rgba(20,20,19,0.18)] backdrop-blur-xl lg:grid-cols-[1.04fr_0.96fr]">
        <section className="mesh-grain-dark relative hidden min-h-[600px] overflow-hidden bg-[linear-gradient(120deg,rgba(79,165,182,0.5),rgba(8,9,9,0.96)_48%,rgba(239,90,42,0.44)),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:auto,72px_100%] p-5 text-white lg:block">
          <div className="grain-noise absolute inset-0 opacity-28" />
          <div className="relative flex h-full flex-col justify-between rounded-[6px] border border-white/14 bg-black/28 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
            <div>
              <div className="inline-flex items-center gap-2 rounded-[3px] border border-white/12 bg-white/10 px-3 py-1.5 font-mono text-xs text-zinc-200">
                <TerminalSquare className="h-3.5 w-3.5 text-[#bdeeff]" />
                scanai workspace --create
              </div>
              <h2 className="mt-10 max-w-lg text-5xl font-semibold leading-[1.02] tracking-tight">
                Start with a clean security workspace.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-zinc-300">
                Create an operator account, then launch scans and generate clean remediation reports.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-[3px] border border-white/12 bg-white/[0.055] px-3 py-2 text-sm text-zinc-300">
              <ShieldCheck className="h-4 w-4 text-[#bdeeff]" />
              Protected setup flow
            </div>
          </div>
        </section>

        <section className="relative flex items-center bg-[#fffefa]/96 p-6 md:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-[430px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-[3px] border border-black/12 bg-[#f2f0eb] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
              <ShieldCheck className="h-4 w-4 text-[#176b78]" />
              New workspace
            </div>

            <h1 className="max-w-md text-4xl font-semibold leading-[1.02] tracking-tight text-[#090909] md:text-5xl">
              Create account.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-zinc-600">
              Start instantly with Google, or create credentials for your ScanAI command desk.
            </p>

            <div className="mt-7 space-y-5">
              <GoogleAuthLink label="Sign up with Google" />
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                <span className="h-px flex-1 bg-black/10" />
                <span>or use email</span>
                <span className="h-px flex-1 bg-black/10" />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label htmlFor="signup-name" className="mb-2 block text-sm font-semibold text-zinc-800">
                  Name
                </label>
                <div className="flex h-12 items-center gap-3 rounded-[4px] border border-black/14 bg-[#f7f6f1] px-3 transition-colors focus-within:border-[#4fa5b6]/70 focus-within:ring-4 focus-within:ring-[#4fa5b6]/15">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white text-zinc-500 shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <input
                    id="signup-name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    disabled={loading}
                    autoComplete="name"
                    className="login-input h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-email" className="mb-2 block text-sm font-semibold text-zinc-800">
                  Email
                </label>
                <div className="flex h-12 items-center gap-3 rounded-[4px] border border-black/14 bg-[#f7f6f1] px-3 transition-colors focus-within:border-[#4fa5b6]/70 focus-within:ring-4 focus-within:ring-[#4fa5b6]/15">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white text-zinc-500 shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setOtpSent(false);
                      setOtp("");
                    }}
                    required
                    disabled={loading}
                    autoComplete="email"
                    className="login-input h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-password" className="mb-2 block text-sm font-semibold text-zinc-800">
                  Password
                </label>
                <div className="flex h-12 items-center gap-3 rounded-[4px] border border-black/14 bg-[#f7f6f1] px-3 transition-colors focus-within:border-[#4fa5b6]/70 focus-within:ring-4 focus-within:ring-[#4fa5b6]/15">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white text-zinc-500 shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
                    <LockKeyhole className="h-4 w-4" />
                  </span>
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={loading}
                    minLength={8}
                    autoComplete="new-password"
                    className="login-input h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="flex h-8 w-8 items-center justify-center rounded-[3px] text-zinc-500 transition-colors hover:bg-black/6 hover:text-zinc-950"
                    aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="signup-confirm" className="mb-2 block text-sm font-semibold text-zinc-800">
                  Confirm password
                </label>
                <div className="flex h-12 items-center gap-3 rounded-[4px] border border-black/14 bg-[#f7f6f1] px-3 transition-colors focus-within:border-[#4fa5b6]/70 focus-within:ring-4 focus-within:ring-[#4fa5b6]/15">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white text-zinc-500 shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
                    <LockKeyhole className="h-4 w-4" />
                  </span>
                  <input
                    id="signup-confirm"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    disabled={loading}
                    minLength={8}
                    autoComplete="new-password"
                    className="login-input h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              {otpSent && (
                <div>
                  <label htmlFor="signup-otp" className="mb-2 block text-sm font-semibold text-zinc-800">
                    Verification code
                  </label>
                  <div className="flex h-12 items-center gap-3 rounded-[4px] border border-black/14 bg-[#f7f6f1] px-3 transition-colors focus-within:border-[#4fa5b6]/70 focus-within:ring-4 focus-within:ring-[#4fa5b6]/15">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white text-zinc-500 shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <input
                      id="signup-otp"
                      type="text"
                      inputMode="numeric"
                      placeholder="6-digit code"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      disabled={loading}
                      autoComplete="one-time-code"
                      className="login-input h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                </div>
              )}

              {notice && (
                <div className="flex items-start gap-2 rounded-[4px] border border-[#4fa5b6]/25 bg-[#effbfc] p-3 text-sm text-[#176b78]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-[4px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                id="signup-submit-button"
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[#0a0a09] text-sm font-semibold text-white transition-colors hover:bg-[#1d1d1b] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? (otpSent ? "Creating account..." : "Sending code...") : otpSent ? "Verify and create account" : "Send verification code"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-zinc-600">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-zinc-950 hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
