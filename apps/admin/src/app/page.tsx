"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  LogOut,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useAuth } from "@scanai/shared/auth-context";
import {
  deleteAdminUser,
  getAdminScans,
  getAdminStats,
  getAdminUsers,
  getTokenUsageStats,
  type AdminScan,
  type AdminStats,
  type AdminUser,
  type TokenUsageStats,
} from "@scanai/shared/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@scanai/shared/utils";

type AdminTab = "users" | "scans" | "tokens";

const STATUS_STYLES: Record<string, string> = {
  complete: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  failed: "border-red-300/20 bg-red-300/10 text-red-100",
  running: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  pending: "border-sky-300/20 bg-sky-300/10 text-sky-100",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[status] || "border-white/10 bg-white/[0.04] text-zinc-300")}>
      {status}
    </span>
  );
}

function MetricCard({ label, value, icon: Icon, tone = "emerald" }: { label: string; value: string | number; icon: React.ElementType; tone?: "emerald" | "sky" | "amber" }) {
  const tones = {
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    sky: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  };

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.035] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-md border", tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-5 font-mono text-3xl font-semibold text-zinc-50">{value}</p>
    </div>
  );
}

function ScanDetailModal({ scan, onClose }: { scan: AdminScan | null; onClose: () => void }) {
  if (!scan) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[84vh] w-full max-w-2xl overflow-auto rounded-lg border border-white/10 bg-[#111517] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Operational metadata</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-50">Scan details</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-white/8 bg-white/[0.04] text-zinc-400 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Target URL", scan.url],
              ["User", scan.user_name || "Anonymous"],
              ["Email", scan.user_email || "-"],
              ["Progress", `${scan.progress_step}/7`],
              ["Created", new Date(scan.created_at).toLocaleString()],
              ["Scan ID", scan.id],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-white/8 bg-white/[0.03] p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
                <p className="break-all text-sm text-zinc-300">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] p-3">
            <span className="text-sm text-zinc-500">Status</span>
            <StatusBadge status={scan.status} />
          </div>

          {scan.error && (
            <div className="rounded-md border border-red-300/20 bg-red-300/10 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200">Error</p>
              <p className="whitespace-pre-wrap font-mono text-xs leading-5 text-red-100">{scan.error}</p>
            </div>
          )}

          <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">Privacy boundary</p>
            <p className="text-sm leading-6 text-amber-50/80">Admin access is limited to operational metadata here. Report contents and generated PDFs remain available to the scan owner.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading, isAdmin, logout } = useAuth();
  const router = useRouter();
  const webLoginUrl = process.env.NEXT_PUBLIC_WEB_APP_URL
    ? `${process.env.NEXT_PUBLIC_WEB_APP_URL}/login`
    : "/login";

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [scans, setScans] = useState<AdminScan[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>("users");
  const [selectedScan, setSelectedScan] = useState<AdminScan | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [nextStats, nextUsers, nextScans, nextTokenStats] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdminScans(),
        getTokenUsageStats(),
      ]);
      setStats(nextStats);
      setUsers(nextUsers);
      setScans(nextScans);
      setTokenStats(nextTokenStats);
    } catch {
      // Auth guard below handles non-admin access.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) {
      router.push(webLoginUrl);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, user, isAdmin, router, loadData, webLoginUrl]);

  const activeScanCount = useMemo(() => scans.filter((scan) => scan.status === "running" || scan.status === "pending").length, [scans]);

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Delete user ${email}? This also deletes their scans.`)) return;
    await deleteAdminUser(userId);
    await loadData();
  }

  async function handleLogout() {
    await logout();
    router.push(webLoginUrl);
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-full bg-[#090b0d] p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <Skeleton className="h-24 rounded-lg bg-white/8" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-lg bg-white/8" />)}
          </div>
          <Skeleton className="h-96 rounded-lg bg-white/8" />
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  const tabs: Array<{ id: AdminTab; label: string; count?: number }> = [
    { id: "users", label: "Users", count: users.length },
    { id: "scans", label: "Scans", count: scans.length },
    { id: "tokens", label: "AI Usage" },
  ];

  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_24%_0%,rgba(34,197,94,0.11),transparent_34%),#090b0d] p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-lg border border-white/8 bg-[#111517] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Platform control plane
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Admin Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Monitor users, scans, and AI usage without exposing customer report contents.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-white/8 bg-white/[0.035] px-3 py-2 text-sm text-zinc-400">
                Signed in as <span className="text-zinc-100">{user?.email}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-white/8 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.075] hover:text-zinc-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </section>

        {stats && (
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Total users" value={stats.total_users} icon={UsersRound} />
            <MetricCard label="Total scans" value={stats.total_scans} icon={BarChart3} tone="sky" />
            <MetricCard label="Active scans" value={activeScanCount || stats.active_scans} icon={Clock3} tone="amber" />
            <MetricCard label="AI reports" value={tokenStats?.total_scans ?? 0} icon={Bot} tone="emerald" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "h-10 rounded-md border px-4 text-sm font-semibold transition-colors",
                tab === item.id
                  ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                  : "border-white/8 bg-white/[0.035] text-zinc-500 hover:text-zinc-200"
              )}
            >
              {item.label}{typeof item.count === "number" ? ` (${item.count})` : ""}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <section className="overflow-hidden rounded-lg border border-white/8 bg-[#111517]">
            <div className="border-b border-white/8 p-5">
              <h2 className="text-xl font-semibold text-zinc-50">Users</h2>
              <p className="mt-1 text-sm text-zinc-500">Account inventory and scan ownership.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Scans</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((adminUser) => (
                    <tr key={adminUser.id} className="border-b border-white/6 last:border-0 hover:bg-white/[0.025]">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/8 bg-white/[0.04] text-zinc-400">
                            <UserRound className="h-4 w-4" />
                          </div>
                          <span className="font-medium text-zinc-200">{adminUser.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-zinc-500">{adminUser.email}</td>
                      <td className="px-4 py-4">
                        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", adminUser.role === "admin" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-zinc-400")}>{adminUser.role}</span>
                      </td>
                      <td className="px-4 py-4 font-mono text-zinc-300">{adminUser.scan_count}</td>
                      <td className="px-4 py-4 text-zinc-500">{new Date(adminUser.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-4 text-right">
                        {adminUser.id !== user?.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(adminUser.id, adminUser.email)}
                            className="inline-flex h-8 items-center gap-2 rounded-md border border-red-300/20 bg-red-300/10 px-3 text-xs font-semibold text-red-100 hover:bg-red-300/15"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "scans" && (
          <section className="overflow-hidden rounded-lg border border-white/8 bg-[#111517]">
            <div className="border-b border-white/8 p-5">
              <h2 className="text-xl font-semibold text-zinc-50">All scans</h2>
              <p className="mt-1 text-sm text-zinc-500">Click a scan row to view operational metadata.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Target</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Step</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.id} onClick={() => setSelectedScan(scan)} className="cursor-pointer border-b border-white/6 last:border-0 hover:bg-white/[0.025]">
                      <td className="max-w-md truncate px-4 py-4 font-mono text-xs text-zinc-300">{scan.url}</td>
                      <td className="px-4 py-4 text-zinc-500">{scan.user_name || scan.user_email || "-"}</td>
                      <td className="px-4 py-4"><StatusBadge status={scan.status} /></td>
                      <td className="px-4 py-4 font-mono text-zinc-300">{scan.progress_step}/7</td>
                      <td className="px-4 py-4 text-zinc-500">{new Date(scan.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "tokens" && tokenStats && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Total tokens" value={tokenStats.total_tokens_all_time.toLocaleString()} icon={Bot} />
              <MetricCard label="AI reports" value={tokenStats.total_scans.toLocaleString()} icon={CheckCircle2} tone="sky" />
              <MetricCard label="Estimated cost" value={tokenStats.total_cost_estimate} icon={BarChart3} tone="amber" />
            </div>

            <section className="overflow-hidden rounded-lg border border-white/8 bg-[#111517]">
              <div className="border-b border-white/8 p-5">
                <h2 className="text-xl font-semibold text-zinc-50">Recent AI usage</h2>
                <p className="mt-1 text-sm text-zinc-500">Token consumption for generated reports.</p>
              </div>
              {tokenStats.recent_usage.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <AlertTriangle className="mb-3 h-8 w-8 text-zinc-600" />
                  <p className="text-sm text-zinc-500">No token usage recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Scan</th>
                        <th className="px-4 py-3 font-medium">User</th>
                        <th className="px-4 py-3 font-medium">Model</th>
                        <th className="px-4 py-3 text-right font-medium">Tokens</th>
                        <th className="px-4 py-3 text-right font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenStats.recent_usage.map((usage) => (
                        <tr key={usage.id} className="border-b border-white/6 last:border-0 hover:bg-white/[0.025]">
                          <td className="px-4 py-4 font-mono text-xs text-zinc-400">{usage.scan_id.slice(0, 8)}...</td>
                          <td className="px-4 py-4 text-zinc-500">{usage.user_email || "Anonymous"}</td>
                          <td className="px-4 py-4 font-mono text-xs text-zinc-400">{usage.model || "unknown"}</td>
                          <td className="px-4 py-4 text-right font-mono text-zinc-300">{usage.total_tokens.toLocaleString()}</td>
                          <td className="px-4 py-4 text-right text-zinc-500">{new Date(usage.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <ScanDetailModal scan={selectedScan} onClose={() => setSelectedScan(null)} />
    </main>
  );
}
