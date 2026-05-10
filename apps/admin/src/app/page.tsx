"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Gauge,
  LogOut,
  PieChart,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserRound,
  UsersRound,
  Wallet,
  X,
  Zap,
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

type AdminTab = "overview" | "users" | "scans" | "tokens";
type ChartDatum = { label: string; value: number; tone?: string };

const STATUS_STYLES: Record<string, string> = {
  complete: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  failed: "border-red-300/20 bg-red-300/10 text-red-100",
  running: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  pending: "border-sky-300/20 bg-sky-300/10 text-sky-100",
};

const STATUS_TONES: Record<string, string> = {
  complete: "#34d399",
  failed: "#f87171",
  running: "#fbbf24",
  pending: "#38bdf8",
};

function formatNumber(value: number) {
  return value.toLocaleString();
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function parseMoney(value: string | undefined) {
  if (!value) return 0;
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
}

function statusCount(scans: AdminScan[], status: string) {
  return scans.filter((scan) => scan.status === status).length;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[status] || "border-white/10 bg-white/[0.04] text-zinc-300")}>
      {status}
    </span>
  );
}

function Panel({ title, eyebrow, icon: Icon, children, className }: { title: string; eyebrow?: string; icon?: React.ElementType; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-white/8 bg-[#111517] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{eyebrow}</p>}
          <h2 className="mt-1 text-xl font-semibold text-zinc-50">{title}</h2>
        </div>
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-300/18 bg-emerald-300/10 text-emerald-100">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "emerald",
  detail,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: "emerald" | "sky" | "amber" | "red";
  detail?: string;
}) {
  const tones = {
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    sky: "border-sky-300/20 bg-sky-300/10 text-sky-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    red: "border-red-300/20 bg-red-300/10 text-red-100",
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
      {detail && <p className="mt-2 text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

function TrendChart({ data }: { data: ChartDatum[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data.map((item, index) => {
    const x = data.length === 1 ? 300 : (index / (data.length - 1)) * 600;
    const y = 180 - (item.value / max) * 150;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="overflow-hidden rounded-md border border-white/8 bg-black/24 p-4">
      <svg viewBox="0 0 600 210" className="h-56 w-full">
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1="0" x2="600" y1={30 + line * 45} y2={30 + line * 45} stroke="rgba(255,255,255,0.07)" />
        ))}
        <polyline points={points} fill="none" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => {
          const x = data.length === 1 ? 300 : (index / (data.length - 1)) * 600;
          const y = 180 - (item.value / max) * 150;
          return <circle key={`${item.label}-${index}`} cx={x} cy={y} r="5" fill="#d9f99d" />;
        })}
        {data.map((item, index) => {
          if (index % Math.ceil(data.length / 5) !== 0 && index !== data.length - 1) return null;
          const x = data.length === 1 ? 300 : (index / (data.length - 1)) * 600;
          return <text key={item.label} x={x} y="205" textAnchor="middle" fill="rgba(212,212,216,0.55)" fontSize="18">{item.label}</text>;
        })}
      </svg>
    </div>
  );
}

function DonutChart({ data, centerLabel }: { data: ChartDatum[]; centerLabel: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const segments = data.reduce<Array<ChartDatum & { dash: number; offset: number }>>((acc, item) => {
    const dash = (item.value / total) * 276.46;
    const offset = acc.length === 0 ? 25 : acc[acc.length - 1].offset + acc[acc.length - 1].dash;
    acc.push({ ...item, dash, offset });
    return acc;
  }, []);

  return (
    <div className="grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
      <div className="relative h-44 w-44">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" />
          {segments.map((item) => (
            <circle
              key={item.label}
              cx="60"
              cy="60"
              r="44"
              fill="none"
              stroke={item.tone || "#34d399"}
              strokeWidth="16"
              strokeDasharray={`${item.dash} 276.46`}
              strokeDashoffset={-item.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold text-zinc-50">{centerLabel}</span>
          <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">total</span>
        </div>
      </div>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.tone || "#34d399" }} />
              <span className="truncate text-sm text-zinc-400">{item.label}</span>
            </div>
            <span className="font-mono text-sm text-zinc-200">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ data, valueSuffix = "" }: { data: ChartDatum[]; valueSuffix?: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="space-y-3">
      {data.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-zinc-400">{item.label}</span>
            <span className="font-mono text-zinc-200">{formatNumber(item.value)}{valueSuffix}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(4, (item.value / max) * 100)}%`, backgroundColor: item.tone || "#34d399" }} />
          </div>
        </div>
      ))}
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
  const [tab, setTab] = useState<AdminTab>("overview");
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

  const analytics = useMemo(() => {
    const complete = statusCount(scans, "complete");
    const failed = statusCount(scans, "failed");
    const running = statusCount(scans, "running");
    const pending = statusCount(scans, "pending");
    const active = running + pending;
    const total = scans.length;
    const cost = parseMoney(tokenStats?.total_cost_estimate);

    const byDayMap = new Map<string, number>();
    const now = new Date();
    for (let i = 13; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      byDayMap.set(day.toISOString().slice(5, 10), 0);
    }
    scans.forEach((scan) => {
      const key = new Date(scan.created_at).toISOString().slice(5, 10);
      if (byDayMap.has(key)) byDayMap.set(key, (byDayMap.get(key) || 0) + 1);
    });

    const planCounts = users.reduce<Record<string, number>>((acc, item) => {
      const plan = item.plan || "beta";
      acc[plan] = (acc[plan] || 0) + 1;
      return acc;
    }, {});

    const topUsers = [...users]
      .sort((a, b) => b.scan_count - a.scan_count)
      .slice(0, 8)
      .map((item) => ({ label: item.email, value: item.scan_count, tone: "#38bdf8" }));

    const modelMix = (tokenStats?.by_model || []).slice(0, 6).map((item) => ({
      label: item.model,
      value: item.total_tokens,
      tone: "#a7f3d0",
    }));

    return {
      complete,
      failed,
      running,
      pending,
      active,
      total,
      cost,
      completionRate: percent(complete, total),
      failureRate: percent(failed, total),
      scansPerUser: users.length ? (total / users.length).toFixed(1) : "0",
      avgTokensPerReport: tokenStats?.total_scans ? Math.round(tokenStats.total_tokens_all_time / tokenStats.total_scans) : 0,
      trend: Array.from(byDayMap.entries()).map(([label, value]) => ({ label, value })),
      statusData: [
        { label: "Complete", value: complete, tone: STATUS_TONES.complete },
        { label: "Failed", value: failed, tone: STATUS_TONES.failed },
        { label: "Running", value: running, tone: STATUS_TONES.running },
        { label: "Pending", value: pending, tone: STATUS_TONES.pending },
      ].filter((item) => item.value > 0),
      planData: Object.entries(planCounts).map(([label, value]) => ({ label, value, tone: label === "internal" ? "#fbbf24" : "#34d399" })),
      topUsers,
      modelMix,
      failures: scans.filter((scan) => scan.status === "failed").slice(0, 8),
      activeScans: scans.filter((scan) => scan.status === "running" || scan.status === "pending").slice(0, 8),
    };
  }, [scans, tokenStats, users]);

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
        <div className="mx-auto max-w-[1600px] space-y-5">
          <Skeleton className="h-24 rounded-lg bg-white/8" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32 rounded-lg bg-white/8" />)}
          </div>
          <Skeleton className="h-96 rounded-lg bg-white/8" />
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  const tabs: Array<{ id: AdminTab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users", count: users.length },
    { id: "scans", label: "Scans", count: scans.length },
    { id: "tokens", label: "AI Usage" },
  ];

  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_24%_0%,rgba(34,197,94,0.11),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(56,189,248,0.08),transparent_30%),#090b0d] p-6 text-zinc-100">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <section className="rounded-lg border border-white/8 bg-[#111517] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Platform control plane
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">Admin Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Revenue-beta operations, customer limits, scan health, AI spend, and queue posture.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-white/8 bg-white/[0.035] px-3 py-2 text-sm text-zinc-400">
                Signed in as <span className="text-zinc-100">{user?.email}</span>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-white/8 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.075] hover:text-zinc-50"
              >
                <Activity className="h-4 w-4" />
                Refresh
              </button>
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Total users" value={stats?.total_users ?? users.length} icon={UsersRound} detail={`${analytics.scansPerUser} scans/user`} />
          <MetricCard label="Total scans" value={stats?.total_scans ?? scans.length} icon={BarChart3} tone="sky" detail={`${analytics.completionRate}% complete`} />
          <MetricCard label="Active queue" value={analytics.active} icon={Clock3} tone="amber" detail={`${analytics.pending} pending · ${analytics.running} running`} />
          <MetricCard label="Failure rate" value={`${analytics.failureRate}%`} icon={ShieldAlert} tone={analytics.failureRate > 20 ? "red" : "emerald"} detail={`${analytics.failed} failed scans`} />
          <MetricCard label="AI tokens" value={formatNumber(tokenStats?.total_tokens_all_time ?? 0)} icon={Bot} tone="sky" detail={`${formatNumber(analytics.avgTokensPerReport)} avg/report`} />
          <MetricCard label="AI spend" value={tokenStats?.total_cost_estimate ?? "$0.0000"} icon={Wallet} tone="amber" detail={`$${analytics.cost.toFixed(4)} estimated`} />
        </div>

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

        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
              <Panel title="Scan volume trend" eyebrow="Last 14 days" icon={TrendingUp}>
                <TrendChart data={analytics.trend} />
              </Panel>
              <Panel title="Scan status mix" eyebrow="Operational posture" icon={PieChart}>
                <DonutChart data={analytics.statusData.length ? analytics.statusData : [{ label: "No scans", value: 1, tone: "rgba(255,255,255,0.12)" }]} centerLabel={String(analytics.total)} />
              </Panel>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Panel title="Plan distribution" eyebrow="Customer packaging" icon={Gauge}>
                <HorizontalBars data={analytics.planData} />
              </Panel>
              <Panel title="Top customers by scans" eyebrow="Usage concentration" icon={UsersRound}>
                <HorizontalBars data={analytics.topUsers} />
              </Panel>
              <Panel title="AI model usage" eyebrow="Token volume" icon={Bot}>
                <HorizontalBars data={analytics.modelMix} />
              </Panel>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title="Active work queue" eyebrow="Now running" icon={Zap}>
                <div className="space-y-2">
                  {analytics.activeScans.length === 0 && <p className="text-sm text-zinc-500">No active scans in the queue.</p>}
                  {analytics.activeScans.map((scan) => (
                    <button key={scan.id} type="button" onClick={() => setSelectedScan(scan)} className="flex w-full items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.03] p-3 text-left hover:bg-white/[0.055]">
                      <span className="min-w-0 truncate font-mono text-xs text-zinc-300">{scan.url}</span>
                      <StatusBadge status={scan.status} />
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel title="Recent failures" eyebrow="Needs review" icon={AlertTriangle}>
                <div className="space-y-2">
                  {analytics.failures.length === 0 && <p className="text-sm text-zinc-500">No failed scans in the latest admin window.</p>}
                  {analytics.failures.map((scan) => (
                    <button key={scan.id} type="button" onClick={() => setSelectedScan(scan)} className="flex w-full items-center justify-between gap-3 rounded-md border border-red-300/12 bg-red-300/[0.045] p-3 text-left hover:bg-red-300/[0.07]">
                      <span className="min-w-0 truncate font-mono text-xs text-red-100">{scan.url}</span>
                      <span className="text-xs text-red-200">{new Date(scan.created_at).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {tab === "users" && (
          <section className="overflow-hidden rounded-lg border border-white/8 bg-[#111517]">
            <div className="border-b border-white/8 p-5">
              <h2 className="text-xl font-semibold text-zinc-50">Users</h2>
              <p className="mt-1 text-sm text-zinc-500">Account inventory, plan limits, and scan ownership.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Limits</th>
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
                      <td className="px-4 py-4 text-zinc-300">{adminUser.plan || "beta"}</td>
                      <td className="px-4 py-4 font-mono text-xs text-zinc-500">{adminUser.monthly_scan_limit}/mo · {adminUser.active_scan_limit} active · {adminUser.schedule_limit} sched</td>
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
              <table className="w-full min-w-[900px] text-sm">
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
            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title="Model token share" eyebrow="All time" icon={PieChart}>
                <DonutChart data={analytics.modelMix.length ? analytics.modelMix : [{ label: "No usage", value: 1, tone: "rgba(255,255,255,0.12)" }]} centerLabel={formatNumber(tokenStats.total_tokens_all_time)} />
              </Panel>
              <Panel title="Top AI consumers" eyebrow="By token volume" icon={UsersRound}>
                <HorizontalBars data={(tokenStats.by_user || []).slice(0, 8).map((item) => ({ label: item.user_email, value: item.total_tokens, tone: "#38bdf8" }))} />
              </Panel>
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
