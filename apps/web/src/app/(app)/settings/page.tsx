"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { CheckCircle2, Clock3, KeyRound, MailCheck, ShieldCheck, UserRound } from "lucide-react";
import {
  changeAccountPassword,
  confirmEmailChange,
  startEmailChange,
  updateAccountTimezone,
  updateAccountProfile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Status = { tone: "ok" | "error"; text: string } | null;

function SettingsCard({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[6px] border border-white/10 bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-[#4fa5b6]/25 bg-[#4fa5b6]/10 text-[#bdeeff]">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-[4px] border border-white/10 bg-black/30 px-3 text-sm font-medium text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#4fa5b6]/60 focus:ring-4 focus:ring-[#4fa5b6]/10 disabled:cursor-not-allowed disabled:opacity-60";

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
];

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [timezoneName, setTimezoneName] = useState("UTC");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [profileStatus, setProfileStatus] = useState<Status>(null);
  const [timezoneStatus, setTimezoneStatus] = useState<Status>(null);
  const [emailStatus, setEmailStatus] = useState<Status>(null);
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setTimezoneName(user.timezone || "UTC");
      setNewEmail("");
    }
  }, [user]);

  const hasPassword = useMemo(
    () => user?.auth_provider === "password" || user?.auth_provider === "password_google",
    [user?.auth_provider]
  );

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("profile");
    setProfileStatus(null);
    try {
      await updateAccountProfile(name);
      await refreshUser();
      setProfileStatus({ tone: "ok", text: "Name updated and confirmation email sent." });
    } catch (error) {
      setProfileStatus({ tone: "error", text: error instanceof Error ? error.message : "Name update failed." });
    } finally {
      setBusy(null);
    }
  };

  const saveTimezone = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("timezone");
    setTimezoneStatus(null);
    try {
      await updateAccountTimezone(timezoneName);
      await refreshUser();
      setTimezoneStatus({ tone: "ok", text: "Schedule timezone updated for your account and checkups." });
    } catch (error) {
      setTimezoneStatus({ tone: "error", text: error instanceof Error ? error.message : "Timezone update failed." });
    } finally {
      setBusy(null);
    }
  };

  const requestEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("email-start");
    setEmailStatus(null);
    try {
      await startEmailChange(newEmail, emailPassword);
      setEmailOtpSent(true);
      setEmailStatus({ tone: "ok", text: "Verification code sent to the new email." });
    } catch (error) {
      setEmailStatus({ tone: "error", text: error instanceof Error ? error.message : "Email change failed." });
    } finally {
      setBusy(null);
    }
  };

  const confirmEmailCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("email-confirm");
    setEmailStatus(null);
    try {
      await confirmEmailChange(newEmail, emailOtp);
      await refreshUser();
      setEmailOtp("");
      setEmailPassword("");
      setEmailOtpSent(false);
      setEmailStatus({ tone: "ok", text: "Email verified and account email updated." });
    } catch (error) {
      setEmailStatus({ tone: "error", text: error instanceof Error ? error.message : "Verification failed." });
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordStatus(null);
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ tone: "error", text: "New passwords do not match." });
      return;
    }
    setBusy("password");
    try {
      await changeAccountPassword(currentPassword, newPassword);
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ tone: "ok", text: "Password updated and confirmation email sent." });
    } catch (error) {
      setPasswordStatus({ tone: "error", text: error instanceof Error ? error.message : "Password update failed." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-full bg-[#070808] px-4 py-8 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#bdeeff]/70">Account controls</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Settings</h1>
          </div>
          <div className="rounded-[4px] border border-white/10 bg-black/24 px-4 py-3 text-sm text-zinc-300">
            <span className="font-semibold text-zinc-100">{user?.email || "Signed in"}</span>
            <span className="mx-2 text-zinc-600">/</span>
            {user?.email_verified ? "Verified email" : "Email not verified"}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <SettingsCard icon={UserRound} title="Profile">
            <form onSubmit={saveName} className="space-y-4">
              <Field label="Name">
                <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} disabled={busy === "profile"} />
              </Field>
              {profileStatus && <StatusMessage status={profileStatus} />}
              <button className="inline-flex h-11 items-center gap-2 rounded-[4px] bg-[#d9f7ff] px-4 text-sm font-semibold text-[#123f4d] transition-colors hover:bg-[#bdeeff] disabled:opacity-60" disabled={busy === "profile"}>
                <CheckCircle2 className="h-4 w-4" />
                {busy === "profile" ? "Saving..." : "Save name"}
              </button>
            </form>
          </SettingsCard>

          <SettingsCard icon={Clock3} title="Schedule timezone">
            <form onSubmit={saveTimezone} className="space-y-4">
              <Field label="Timezone">
                <input
                  className={inputClass}
                  list="settings-timezones"
                  value={timezoneName}
                  onChange={(event) => setTimezoneName(event.target.value)}
                  placeholder="Asia/Kolkata"
                  disabled={busy === "timezone"}
                />
                <datalist id="settings-timezones">
                  {COMMON_TIMEZONES.map((timezone) => (
                    <option key={timezone} value={timezone} />
                  ))}
                </datalist>
              </Field>
              <p className="text-sm leading-6 text-zinc-500">
                Recurring checkups use this timezone. New accounts start with a best-effort timezone from signup IP, and you can adjust it here.
              </p>
              {timezoneStatus && <StatusMessage status={timezoneStatus} />}
              <button className="inline-flex h-11 items-center gap-2 rounded-[4px] bg-[#d9f7ff] px-4 text-sm font-semibold text-[#123f4d] transition-colors hover:bg-[#bdeeff] disabled:opacity-60" disabled={busy === "timezone"}>
                <CheckCircle2 className="h-4 w-4" />
                {busy === "timezone" ? "Saving..." : "Save timezone"}
              </button>
            </form>
          </SettingsCard>

          <SettingsCard icon={MailCheck} title="Email">
            <form onSubmit={emailOtpSent ? confirmEmailCode : requestEmailCode} className="space-y-4">
              <Field label="Current email">
                <input className={inputClass} value={user?.email || ""} disabled readOnly />
              </Field>
              <Field label="New email">
                <input className={inputClass} type="email" value={newEmail} onChange={(event) => {
                  setNewEmail(event.target.value);
                  setEmailOtpSent(false);
                  setEmailOtp("");
                }} required />
              </Field>
              {hasPassword && (
                <Field label="Current password">
                  <input className={inputClass} type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} autoComplete="current-password" required />
                </Field>
              )}
              {emailOtpSent && (
                <Field label="Verification code">
                  <input className={inputClass} inputMode="numeric" value={emailOtp} onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" required />
                </Field>
              )}
              {emailStatus && <StatusMessage status={emailStatus} />}
              <button className="inline-flex h-11 items-center gap-2 rounded-[4px] bg-[#d9f7ff] px-4 text-sm font-semibold text-[#123f4d] transition-colors hover:bg-[#bdeeff] disabled:opacity-60" disabled={busy === "email-start" || busy === "email-confirm"}>
                <MailCheck className="h-4 w-4" />
                {emailOtpSent ? "Verify new email" : "Send verification code"}
              </button>
            </form>
          </SettingsCard>

          <SettingsCard icon={KeyRound} title="Password">
            <form onSubmit={savePassword} className="space-y-4">
              {hasPassword && (
                <Field label="Current password">
                  <input className={inputClass} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
                </Field>
              )}
              <Field label="New password">
                <input className={inputClass} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
              </Field>
              <Field label="Confirm new password">
                <input className={inputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
              </Field>
              {passwordStatus && <StatusMessage status={passwordStatus} />}
              <button className="inline-flex h-11 items-center gap-2 rounded-[4px] bg-[#d9f7ff] px-4 text-sm font-semibold text-[#123f4d] transition-colors hover:bg-[#bdeeff] disabled:opacity-60" disabled={busy === "password"}>
                <KeyRound className="h-4 w-4" />
                {busy === "password" ? "Saving..." : hasPassword ? "Change password" : "Set password"}
              </button>
            </form>
          </SettingsCard>

          <SettingsCard icon={ShieldCheck} title="Security mail">
            <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
              {["Name changes", "Email change requests", "New email verification", "Password changes"].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-[4px] border border-white/10 bg-black/22 px-3 py-3">
                  <CheckCircle2 className="h-4 w-4 text-[#bdeeff]" />
                  {item}
                </div>
              ))}
            </div>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}

function StatusMessage({ status }: { status: NonNullable<Status> }) {
  return (
    <div className={`rounded-[4px] border px-3 py-2 text-sm ${status.tone === "ok" ? "border-[#4fa5b6]/25 bg-[#4fa5b6]/10 text-[#bdeeff]" : "border-red-400/25 bg-red-500/10 text-red-200"}`}>
      {status.text}
    </div>
  );
}
