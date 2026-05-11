"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Ban,
  Bell,
  Boxes,
  Bug,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Globe2,
  Layers3,
  Play,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TerminalSquare,
  Trash2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  cancelScan,
  createAuthProfile,
  createProgram,
  createProgramScopeRule,
  createScanTarget,
  createSchedule,
  createScan,
  deleteAuthProfile,
  deleteSchedule,
  getAccountUsage,
  getProgramReleaseGate,
  getScanDashboard,
  getScanEventsWebSocketUrl,
  listAssets,
  listAuthProfiles,
  listFindings,
  listProgramScope,
  listPrograms,
  listScanTargets,
  listSchedules,
  previewProgramScope,
  updateFindingStatus,
  updateSchedule,
  verifyScanTarget,
  type AccountUsage,
  type AuthProfile,
  type DashboardCategoryCount,
  type DashboardDayCount,
  type DashboardRecentScan,
  type Asset,
  type PersistentFinding,
  type Program,
  type ReleaseGate,
  type ScheduledScan,
  type ScanTarget,
  type ScanEventMessage,
  type ScanDashboardResponse,
  type ScopePreview,
  type ScopeRule,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EMPTY_DASHBOARD: ScanDashboardResponse = {
  total_scans: 0,
  complete_scans: 0,
  active_scans: 0,
  failed_scans: 0,
  reports_ready: 0,
  total_findings: 0,
  average_risk_score: null,
  severity_counts: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  },
  category_counts: [],
  top_assets: [],
  scans_by_day: [],
  recent_scans: [],
};

const DASHBOARD_THEME_KEY = "scanai-dashboard-theme";
type DashboardTheme = "dark" | "light";

function DashboardCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("dashboard-card rounded-[6px] border border-white/10 bg-[#101415]/94 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", className)}>
      {children}
    </section>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="dashboard-empty-panel flex min-h-52 flex-col items-center justify-center rounded-[4px] border border-dashed border-white/12 bg-white/[0.02] px-6 text-center">
      <ShieldCheck className="mb-3 h-8 w-8 text-[#4fa5b6]" />
      <p className="font-medium text-zinc-200">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{text}</p>
    </div>
  );
}

function ActiveScanBanner({ scans }: { scans: DashboardRecentScan[] }) {
  const activeScans = scans.filter((scan) => scan.status === "running" || scan.status === "pending");
  if (activeScans.length === 0) return null;

  const primaryScan = activeScans[0];
  const progress = Math.max(6, Math.min(100, Math.round((primaryScan.progress_step / 7) * 100)));
  const remainingCount = Math.max(activeScans.length - 1, 0);

  return (
    <section className="dashboard-live-scan-banner overflow-hidden rounded-[6px] border border-[#4fa5b6]/26 bg-[linear-gradient(90deg,rgba(79,165,182,0.16),rgba(239,90,42,0.09))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-[#4fa5b6]/28 bg-[#4fa5b6]/12 text-[#d9f7ff]">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-zinc-50">Security scan running</p>
              <span className="rounded-[3px] border border-orange-300/18 bg-orange-300/10 px-2 py-0.5 text-xs font-semibold text-orange-100">
                {activeScans.length} active
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-zinc-400">
              {primaryScan.url}{remainingCount > 0 ? ` and ${remainingCount} more scan${remainingCount === 1 ? "" : "s"}` : ""} are updating live.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden w-40 md:block">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#4fa5b6] to-[#ef5a2a]" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <Link
            href={`/scan/${primaryScan.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-[4px] border border-white/12 bg-white/[0.06] px-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.1]"
          >
            Open scan
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  tone = "emerald",
  featured = false,
  className,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  tone?: "emerald" | "red" | "amber" | "sky";
  featured?: boolean;
  className?: string;
  href?: string;
}) {
  const toneClass = {
    emerald: "text-[#bdeeff] bg-[#4fa5b6]/12 border-[#4fa5b6]/28",
    red: "text-orange-200 bg-[#ef5a2a]/12 border-[#ef5a2a]/28",
    amber: "text-orange-100 bg-[#ef5a2a]/10 border-[#ef5a2a]/24",
    sky: "text-[#bdeeff] bg-[#4fa5b6]/10 border-[#4fa5b6]/24",
  }[tone];
  const toneBar = {
    emerald: "from-[#4fa5b6] to-[#86d7c8]",
    red: "from-[#ef5a2a] to-[#fb923c]",
    amber: "from-[#d4860a] to-[#ef5a2a]",
    sky: "from-[#4fa5b6] to-[#bdeeff]",
  }[tone];

  const content = (
    <>
      <div className="flex items-center gap-4">
        <div className={cn("dashboard-metric-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] border", `dashboard-metric-icon-${tone}`, toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className={cn("font-mono font-semibold leading-none tracking-tight text-zinc-50", featured ? "text-4xl" : "text-3xl")}>{value}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={cn("h-full w-2/3 rounded-full bg-gradient-to-r", toneBar)} />
      </div>
    </>
  );
  const metricClassName = cn(
    "dashboard-metric group rounded-[4px] border border-white/10 bg-white/[0.035] p-4 transition-colors hover:border-white/18 hover:bg-white/[0.055]",
    href && "block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4fa5b6]/60",
    featured && "bg-[linear-gradient(135deg,rgba(79,165,182,0.13),rgba(255,255,255,0.035)_52%,rgba(239,90,42,0.09))]",
    className
  );

  if (href) {
    return (
      <Link href={href} className={metricClassName} aria-label={`Open ${label}`}>
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "dashboard-metric group rounded-[4px] border border-white/10 bg-white/[0.035] p-4 transition-colors hover:border-white/18 hover:bg-white/[0.055]",
        featured && "bg-[linear-gradient(135deg,rgba(79,165,182,0.13),rgba(255,255,255,0.035)_52%,rgba(239,90,42,0.09))]",
        className
      )}
    >
      {content}
    </div>
  );
}

function SeverityBars({ counts, total }: { counts: ScanDashboardResponse["severity_counts"]; total: number }) {
  const rows = [
    { label: "Critical", value: counts.critical, tone: "#ef5a2a" },
    { label: "High", value: counts.high, tone: "#fb923c" },
    { label: "Medium", value: counts.medium, tone: "#d4860a" },
    { label: "Low", value: counts.low, tone: "#4fa5b6" },
    { label: "Info", value: counts.info, tone: "#86d7c8" },
  ];

  return (
    <div className="dashboard-severity-list space-y-3">
      {rows.map((row) => {
        const percent = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return (
          <div key={row.label} className="dashboard-severity-row rounded-[4px] border border-white/10 bg-black/18 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.tone }} />
                <span className="text-sm font-semibold text-zinc-200">{row.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-lg font-semibold text-zinc-50">{row.value}</span>
                <span className="text-xs text-zinc-500">{percent}%</span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(row.value > 0 ? 7 : 0, percent)}%`,
                  backgroundColor: row.tone,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityChart({ data }: { data: DashboardDayCount[] }) {
  if (data.length === 0) {
    return (
      <EmptyPanel
        title="No scan trend yet"
        text="Run scans through make dev and this chart will reflect real scan and finding counts by day."
      />
    );
  }

  const width = 760;
  const height = 154;
  const max = Math.max(...data.map((point) => Math.max(point.scans, point.findings)), 1);
  const xFor = (index: number) => (data.length === 1 ? width / 2 : (index / (data.length - 1)) * width);
  const points = (key: "scans" | "findings") =>
    data
      .map((point, index) => {
        const x = xFor(index);
        const y = height - (point[key] / max) * height;
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <div className="dashboard-chart mt-5 overflow-hidden rounded-[4px] border border-white/10 bg-black/24 p-4">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-[#4fa5b6]" /> Scans</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-[#ef5a2a]" /> Findings</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 32}`} className="h-[184px] w-full">
        {Array.from({ length: 8 }).map((_, index) => (
          <line
            className="dashboard-chart-grid"
            key={index}
            x1={(index / 7) * width}
            x2={(index / 7) * width}
            y1="0"
            y2={height}
            stroke="rgba(255,255,255,0.05)"
          />
        ))}
        {Array.from({ length: 5 }).map((_, index) => (
          <line
            className="dashboard-chart-grid"
            key={index}
            x1="0"
            x2={width}
            y1={(index / 4) * height}
            y2={(index / 4) * height}
            stroke="rgba(255,255,255,0.05)"
          />
        ))}
        <polyline points={points("scans")} fill="none" stroke="#4fa5b6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={points("findings")} fill="none" stroke="#ef5a2a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((point, index) => (
          <text
            className="dashboard-chart-date"
            key={point.date}
            x={Math.min(width - 24, Math.max(24, xFor(index)))}
            y={height + 28}
            fill="rgba(212,212,216,0.55)"
            fontSize="13"
            textAnchor="middle"
          >
            {new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        ))}
      </svg>
    </div>
  );
}

function RiskGauge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <div className="mt-5 flex min-h-56 flex-col items-center justify-center rounded-[4px] border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
        <ShieldAlert className="mb-3 h-9 w-9 text-zinc-600" />
        <p className="font-medium text-zinc-200">No risk score yet</p>
        <p className="mt-1 max-w-xs text-sm text-zinc-500">
          Run a scan and wait for a completed report to calculate average risk.
        </p>
      </div>
    );
  }

  const clamped = value === null ? 0 : Math.max(0, Math.min(value, 100));
  const rotation = -90 + clamped * 1.8;
  const label = clamped >= 80 ? "critical" : clamped >= 60 ? "high" : clamped >= 40 ? "medium" : clamped >= 20 ? "low" : "minimal";

  return (
    <div className="mt-5">
      <div className="relative mx-auto h-44 max-w-[280px]">
        <svg viewBox="0 0 320 170" className="h-full w-full">
          <path d="M52 138a108 108 0 0 1 216 0" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="26" strokeLinecap="round" />
          <path d="M52 138a108 108 0 0 1 118 -107" fill="none" stroke="rgba(79,165,182,0.92)" strokeWidth="26" strokeLinecap="round" />
          <path d="M170 31a108 108 0 0 1 98 107" fill="none" stroke="rgba(239,90,42,0.72)" strokeWidth="26" strokeLinecap="round" />
          <line
            className="risk-gauge-needle"
            x1="160"
            y1="138"
            x2="160"
            y2="58"
            stroke="#f8fafc"
            strokeLinecap="round"
            strokeWidth="7"
            style={{ transformOrigin: "160px 138px", transform: `rotate(${rotation}deg)` }}
          />
          <circle cx="160" cy="138" r="15" fill="#4fa5b6" />
          <circle cx="160" cy="138" r="4" fill="#090b0d" />
        </svg>
      </div>
      <div className="-mt-5 text-center">
        <p className="font-mono text-4xl font-semibold text-zinc-50">{clamped}%</p>
        <p className="mt-1 text-xs text-zinc-500">average report risk</p>
        <span className="mt-3 inline-flex rounded-[3px] border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
          {label} risk
        </span>
      </div>
    </div>
  );
}

function QuickScanForm({
  onCreated,
  onSchedule,
  programs = [],
  authProfilesByProgram = {},
  variant = "default",
}: {
  onCreated: () => void;
  onSchedule?: (target: string) => void;
  programs?: Program[];
  authProfilesByProgram?: Record<string, AuthProfile[]>;
  variant?: "default" | "hero";
}) {
  const [url, setUrl] = useState("");
  const [programId, setProgramId] = useState("");
  const [authProfileId, setAuthProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const heroVariant = variant === "hero";
  const selectedProgramId = programs.some((program) => program.id === programId) ? programId : programs[0]?.id || "";
  const authProfiles = selectedProgramId ? authProfilesByProgram[selectedProgramId] || [] : [];
  const selectedAuthProfileId = authProfiles.some((profile) => profile.id === authProfileId) ? authProfileId : "";

  const normalizedUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a target URL.");
      return;
    }
    if (!selectedProgramId) {
      setError("Create or select a program before running a scan.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scanUrl = normalizedUrl(trimmed);
      const { scan_id } = await createScan(scanUrl, selectedProgramId, selectedAuthProfileId || null);
      onCreated();
      router.push(`/scan/${scan_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start scan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5">
      <div
        className={cn(
          "dashboard-input-shell scan-input-shell flex flex-col gap-2 rounded-[4px] border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:flex-row sm:items-center",
          heroVariant ? "border-white/18 bg-black/34" : "border-white/10 bg-black/30"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className={cn("scan-input-icon flex items-center pl-2", heroVariant ? "!text-white/65" : "text-zinc-500")}>
            <TerminalSquare className="h-4 w-4" />
          </div>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={loading}
            placeholder="https://app.example.com"
            className={cn(
              "scan-input-field h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none",
              heroVariant ? "!text-white placeholder:!text-white/60" : "text-zinc-100 placeholder:text-zinc-600"
            )}
            aria-label="Target URL"
          />
        </div>
        {programs.length > 0 ? (
          <select
            value={selectedProgramId}
            onChange={(event) => {
              setProgramId(event.target.value);
              setAuthProfileId("");
            }}
            disabled={loading}
            className={cn(
              "h-10 min-w-44 rounded-[3px] border border-white/10 bg-black/24 px-3 text-sm outline-none focus:border-[#4fa5b6]/60",
              heroVariant ? "text-white" : "text-zinc-100"
            )}
            aria-label="Bug bounty program"
          >
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        ) : (
          <Link
            href="/dashboard?view=programs"
            className="inline-flex h-10 min-w-44 items-center justify-center rounded-[3px] border border-[#4fa5b6]/30 bg-[#4fa5b6]/10 px-3 text-sm font-semibold text-[#d9f7ff] transition-colors hover:bg-[#4fa5b6]/15"
          >
            Create program
          </Link>
        )}
        {authProfiles.length > 0 && (
          <select
            value={selectedAuthProfileId}
            onChange={(event) => setAuthProfileId(event.target.value)}
            disabled={loading}
            className={cn(
              "h-10 min-w-44 rounded-[3px] border border-white/10 bg-black/24 px-3 text-sm outline-none focus:border-[#4fa5b6]/60",
              heroVariant ? "text-white" : "text-zinc-100"
            )}
            aria-label="Auth profile"
          >
            <option value="">Unauthenticated</option>
            {authProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex shrink-0 gap-2">
          <button
            type="submit"
            disabled={loading || !selectedProgramId}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[3px] bg-white px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            <Play className="h-4 w-4" />
            {loading ? "Starting" : "Run"}
          </button>
          {onSchedule && (
            <button
              type="button"
              onClick={() => onSchedule(normalizedUrl(url))}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[3px] border border-white/16 bg-white/[0.06] px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/[0.1] sm:flex-none"
            >
              <CalendarPlus className="h-4 w-4" />
              Schedule
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </form>
  );
}

function CommandFlowPreview() {
  const items = [
    { label: "Target", title: "scanai.target", text: "Crawl reachable surface", icon: Globe2, tone: "text-[#4fa5b6] bg-[#4fa5b6]/10" },
    { label: "Finding", title: "Open route", text: "Evidence grouped by risk", icon: TerminalSquare, tone: "text-[#ef5a2a] bg-[#ef5a2a]/10" },
    { label: "Report", title: "Fix prompt", text: "Owner-ready handoff", icon: FileText, tone: "text-zinc-300 bg-white/10" },
  ];

  return (
    <div className="mt-8 grid max-w-4xl gap-3 md:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="dashboard-flow-card border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className={cn("dashboard-flow-icon flex h-9 w-9 items-center justify-center rounded-[3px]", item.tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="dashboard-flow-label text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{item.label}</p>
                <p className="dashboard-flow-title truncate text-sm font-semibold text-zinc-100">{item.title}</p>
              </div>
            </div>
            <p className="dashboard-flow-text text-xs leading-5 text-zinc-500">{item.text}</p>
          </div>
        );
      })}
    </div>
  );
}

function BarList({ items, emptyTitle, emptyText }: { items: DashboardCategoryCount[]; emptyTitle: string; emptyText: string }) {
  if (items.length === 0) {
    return <EmptyPanel title={emptyTitle} text={emptyText} />;
  }

  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="mt-5 space-y-3">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[132px_1fr_42px] items-center gap-3">
          <span className="dashboard-bar-label truncate text-sm text-zinc-400" title={item.label}>{item.label}</span>
          <div className="dashboard-bar-track h-7 overflow-hidden rounded-[3px] border border-[#ef5a2a]/20 bg-[#ef5a2a]/5">
            <div
              className="dashboard-bar-fill h-full bg-gradient-to-r from-[#4fa5b6]/20 to-[#ef5a2a]/65"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="dashboard-bar-value font-mono text-xs text-orange-100">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function scanStatusClass(status: DashboardRecentScan["status"]) {
  return cn(
    status === "complete" && "scan-status-complete bg-[#4fa5b6]/10 text-[#d9f7ff]",
    status === "failed" && "scan-status-failed bg-red-300/10 text-red-200",
    (status === "running" || status === "pending") && "scan-status-active bg-[#ef5a2a]/10 text-orange-200"
  );
}

type ViewId =
  | "surface"
  | "programs"
  | "scans"
  | "findings"
  | "reports";

type ScanFilter = "all" | "active" | "failed" | "complete";

type PanelId =
  | "notifications"
  | "settings"
  | "search"
  | "account";

const VIEW_IDS: ViewId[] = ["surface", "programs", "scans", "findings", "reports"];
const SCAN_FILTERS: ScanFilter[] = ["all", "active", "failed", "complete"];

const SCHEDULE_PRESETS = [
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Daily 9 AM", cron: "0 9 * * *" },
  { label: "Weekly Monday", cron: "0 9 * * 1" },
  { label: "Monthly", cron: "0 9 1 * *" },
];

const FINDING_STATUSES: Array<PersistentFinding["status"]> = [
  "new",
  "triaged",
  "accepted",
  "duplicate",
  "false_positive",
  "fixed",
  "regressed",
];

type AuthProfileMode = "cookie" | "bearer" | "basic" | "header";

function inferScopeAssetType(value: string): ScopeRule["asset_type"] {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return "path";
  if (/^https?:\/\//i.test(trimmed)) return "url";
  if (trimmed.includes("*")) return "wildcard";
  if (trimmed.includes("/")) return "cidr";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return "ip";
  return "domain";
}

function defaultAuthProfileName(mode: AuthProfileMode) {
  if (mode === "cookie") return "Cookie session";
  if (mode === "bearer") return "Bearer token";
  if (mode === "basic") return "Basic credentials";
  return "Custom header";
}

const PANEL_TITLES: Record<PanelId, { title: string; eyebrow: string; icon: React.ElementType }> = {
  notifications: { title: "Notifications", eyebrow: "Attention queue", icon: Bell },
  settings: { title: "Settings", eyebrow: "Workspace preferences", icon: Settings },
  search: { title: "Command Search", eyebrow: "Find scans and assets", icon: Search },
  account: { title: "Account", eyebrow: "Profile and access", icon: UserRound },
};

const PANEL_IDS = Object.keys(PANEL_TITLES) as PanelId[];

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="dashboard-drawer-section rounded-[4px] border border-white/10 bg-white/[0.035] p-4">
      <h3 className="dashboard-drawer-section-title text-sm font-semibold text-zinc-100">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[3px] px-4 text-sm font-semibold transition-colors",
        tone === "primary" && "bg-white text-zinc-950 hover:bg-zinc-200",
        tone === "danger" && "bg-[#ef5a2a] text-white hover:bg-[#ff7247]",
        tone === "default" && "border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.075]"
      )}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  checkedLabel = "On",
  uncheckedLabel = "Off",
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  checkedLabel?: string;
  uncheckedLabel?: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="flex w-full items-center justify-between gap-4 border-b border-white/8 py-4 text-left last:border-b-0"
    >
      <span>
        <span className="block text-sm font-medium text-zinc-200">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-zinc-500">{description}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="rounded-[3px] border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
          {checked ? checkedLabel : uncheckedLabel}
        </span>
        <span className={cn("flex h-7 w-12 items-center rounded-full border p-1 transition-colors", checked ? "border-[#4fa5b6]/30 bg-[#4fa5b6]/20" : "border-white/10 bg-white/[0.04]")}>
          <span className={cn("h-5 w-5 rounded-full transition-transform", checked ? "translate-x-5 bg-[#4fa5b6]" : "bg-zinc-500")} />
        </span>
      </span>
    </button>
  );
}

function MiniStat({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string | number;
  variant?: "default" | "hero";
}) {
  const hero = variant === "hero";

  return (
    <div
      className={cn(
        "rounded-[4px] border p-3",
        hero
          ? "dashboard-hero-stat border-white/16 bg-black/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_34px_rgba(0,0,0,0.12)]"
          : "dashboard-mini-stat border-white/10 bg-black/20"
      )}
    >
      <p className={cn("font-mono text-2xl font-semibold", hero ? "dashboard-hero-stat-value text-white" : "text-zinc-50")}>{value}</p>
      <p className={cn("mt-1 text-xs", hero ? "dashboard-hero-stat-label text-white/62" : "text-zinc-500")}>{label}</p>
    </div>
  );
}

function ScanRow({ scan }: { scan: DashboardRecentScan }) {
  return (
    <div className="dashboard-scan-row rounded-[4px] border border-white/10 bg-black/18 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-zinc-200">{scan.url}</p>
        <span
          className={cn(
            "scan-status-badge shrink-0 rounded-[3px] px-2 py-1 text-[10px] font-semibold",
            scanStatusClass(scan.status)
          )}
        >
          {scan.status}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>Risk {scan.risk_score ?? "--"}</span>
        <span>{scan.findings_count} findings</span>
      </div>
    </div>
  );
}

function ScanTable({
  scans,
  stoppingScanId,
  stopError,
  onStopScan,
  limit,
  viewMoreHref,
  emptyTitle = "No scans yet",
  emptyText = "Run a target scan to populate this command view.",
}: {
  scans: DashboardRecentScan[];
  stoppingScanId: string | null;
  stopError: string | null;
  onStopScan: (scanId: string) => void;
  limit?: number;
  viewMoreHref?: string;
  emptyTitle?: string;
  emptyText?: string;
}) {
  const visibleScans = typeof limit === "number" ? scans.slice(0, limit) : scans;
  const hiddenCount = scans.length - visibleScans.length;

  return (
    <DashboardCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-50">Recent scans</h2>
        <div className="flex items-center gap-3">
          {stopError && <span className="text-xs text-red-300">{stopError}</span>}
          <span className="text-sm text-zinc-500">
            {hiddenCount > 0 ? `${visibleScans.length} of ${scans.length}` : `${scans.length} shown`}
          </span>
          {hiddenCount > 0 && viewMoreHref && (
            <Link
              href={viewMoreHref}
              className="inline-flex h-8 items-center gap-1 rounded-[3px] border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.075]"
            >
              View more <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
      {visibleScans.length === 0 ? (
        <EmptyPanel title={emptyTitle} text={emptyText} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs text-zinc-500">
                <th className="px-3 py-3 font-medium">Target</th>
                <th className="px-3 py-3 font-medium">Risk</th>
                <th className="px-3 py-3 font-medium">Findings</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleScans.map((scan) => (
                <tr key={scan.id} className="border-b border-white/6 last:border-0 hover:bg-white/[0.025]">
                  <td className="max-w-sm truncate px-3 py-3 font-medium text-zinc-200">{scan.url}</td>
                  <td className="px-3 py-3 font-mono text-zinc-400">{scan.risk_score ?? "--"}</td>
                  <td className="px-3 py-3 font-mono text-zinc-400">{scan.findings_count}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "scan-status-badge inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1 text-xs font-medium",
                        scanStatusClass(scan.status)
                      )}
                    >
                      {scan.status === "complete" && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {scan.status === "failed" && <XCircle className="h-3.5 w-3.5" />}
                      {(scan.status === "running" || scan.status === "pending") && <AlertTriangle className="h-3.5 w-3.5" />}
                      {scan.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {(scan.status === "running" || scan.status === "pending") && (
                        <button
                          type="button"
                          onClick={() => onStopScan(scan.id)}
                          disabled={stoppingScanId === scan.id}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 transition-colors hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          {stoppingScanId === scan.id ? "Stopping" : "Stop"}
                        </button>
                      )}
                      <Link
                        href={scan.status === "complete" ? `/report/${scan.id}` : `/scan/${scan.id}`}
                        className="inline-flex items-center gap-1 rounded-[3px] bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                      >
                        Open <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}

function ScheduleManager({
  schedules,
  onChanged,
  prefillUrl,
  focusSignal,
  defaultTimezone,
}: {
  schedules: ScheduledScan[];
  onChanged: () => Promise<void>;
  prefillUrl?: string;
  focusSignal?: number;
  defaultTimezone: string;
}) {
  const [url, setUrl] = useState("");
  const [cron, setCron] = useState(SCHEDULE_PRESETS[1].cron);
  const [saving, setSaving] = useState(false);
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusSignalRef = useRef(focusSignal);

  const normalizeScheduleUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  useEffect(() => {
    if (focusSignal === undefined || lastFocusSignalRef.current === focusSignal) return;
    lastFocusSignalRef.current = focusSignal;
    const nextUrl = normalizeScheduleUrl(prefillUrl || "");
    window.setTimeout(() => {
      if (nextUrl) setUrl(nextUrl);
      urlInputRef.current?.focus();
    }, 220);
  }, [focusSignal, prefillUrl]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createSchedule({ url: normalizeScheduleUrl(url), cron, timezone: defaultTimezone, is_active: true });
      setUrl("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create schedule.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule: ScheduledScan) => {
    setBusyScheduleId(schedule.id);
    setError(null);
    try {
      await updateSchedule(schedule.id, { is_active: !schedule.is_active });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update schedule.");
    } finally {
      setBusyScheduleId(null);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    setBusyScheduleId(scheduleId);
    setError(null);
    try {
      await deleteSchedule(scheduleId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete schedule.");
    } finally {
      setBusyScheduleId(null);
    }
  };

  return (
    <DashboardCard>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-50">Scheduled checkups</h2>
          <p className="mt-1 text-sm text-zinc-500">Set a regular scan cadence for targets that need ongoing watch.</p>
        </div>
        <CalendarClock className="h-5 w-5 text-[#4fa5b6]" />
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_190px_auto]">
        <input
          ref={urlInputRef}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://app.example.com"
          className="dashboard-schedule-input h-11 rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          required
        />
        <select
          value={cron}
          onChange={(event) => setCron(event.target.value)}
          className="dashboard-schedule-input h-11 rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none"
        >
          {SCHEDULE_PRESETS.map((preset) => (
            <option key={preset.cron} value={preset.cron}>{preset.label}</option>
          ))}
          <option value={cron}>Custom</option>
        </select>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[4px] bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CalendarPlus className="h-4 w-4" />
          {saving ? "Saving" : "Schedule checkup"}
        </button>
      </form>
      <p className="mt-3 text-xs text-zinc-500">
        Uses account timezone <span className="font-semibold text-zinc-300">{defaultTimezone}</span>. Change it in{" "}
        <Link href="/settings" className="font-semibold text-[#bdeeff] hover:underline">Settings</Link>.
      </p>

      <input
        value={cron}
        onChange={(event) => setCron(event.target.value)}
        aria-label="Cron expression"
        className="dashboard-schedule-input mt-3 h-10 w-full rounded-[4px] border border-white/10 bg-black/18 px-3 font-mono text-xs text-zinc-300 outline-none placeholder:text-zinc-600"
        placeholder="0 9 * * *"
      />

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mt-5 space-y-2">
        {schedules.length === 0 ? (
          <WorkspaceEmpty title="No recurring scans" text="Create a schedule and the BullMQ scheduler will trigger scans in the background." />
        ) : (
          schedules.map((schedule) => (
            <div key={schedule.id} className="dashboard-schedule-row flex flex-col gap-3 rounded-[4px] border border-white/10 bg-black/18 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-100">{schedule.url}</p>
                  <span className={cn("rounded-[3px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", schedule.is_active ? "bg-[#4fa5b6]/12 text-[#d9f7ff]" : "bg-white/[0.06] text-zinc-500")}>
                    {schedule.is_active ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-500">{schedule.cron} · {schedule.timezone}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Last run {schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : "not yet"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(schedule)}
                  disabled={busyScheduleId === schedule.id}
                  className="inline-flex h-9 items-center rounded-[3px] border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.075] disabled:opacity-60"
                >
                  {schedule.is_active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(schedule.id)}
                  disabled={busyScheduleId === schedule.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[3px] border border-red-300/15 bg-red-300/[0.06] text-red-200 transition hover:bg-red-300/[0.1] disabled:opacity-60"
                  aria-label={`Delete schedule for ${schedule.url}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}

function DashboardPanelDrawer({
  panel,
  dashboard,
  usage,
  targets,
  user,
  theme,
  onThemeChange,
  onClose,
  onTargetsChanged,
}: {
  panel: PanelId | null;
  dashboard: ScanDashboardResponse;
  usage: AccountUsage | null;
  targets: ScanTarget[];
  user: { name?: string; email?: string; role?: string } | null;
  theme: DashboardTheme;
  onThemeChange: (theme: DashboardTheme) => void;
  onClose: () => void;
  onTargetsChanged: () => Promise<void>;
}) {
  const [settings, setSettings] = useState({
    autoRefresh: true,
    compactTables: false,
    emailReports: false,
    includeLowSeverity: true,
    sharePdfLinks: true,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notificationsCleared, setNotificationsCleared] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [targetBusyId, setTargetBusyId] = useState<string | null>(null);

  if (!panel) return null;

  const meta = PANEL_TITLES[panel];
  const Icon = meta.icon;
  const visibleSearchItems = [
    ...dashboard.recent_scans.map((scan) => ({ type: "Scan", label: scan.url, meta: `${scan.status} · ${scan.findings_count} findings` })),
    ...dashboard.top_assets.map((asset) => ({ type: "Asset", label: asset.asset, meta: `${asset.count} findings` })),
    ...dashboard.category_counts.map((category) => ({ type: "Category", label: category.label, meta: `${category.count} findings` })),
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  };

  const handleAddTarget = async () => {
    const value = targetInput.trim();
    if (!value) return;
    try {
      const target = await createScanTarget(value);
      setTargetInput("");
      await onTargetsChanged();
      showNotice(`Add TXT record for ${target.domain}.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Unable to add target.");
    }
  };

  const handleVerifyTarget = async (targetId: string) => {
    setTargetBusyId(targetId);
    try {
      const result = await verifyScanTarget(targetId);
      await onTargetsChanged();
      showNotice(result.message);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Target is not verified yet.");
    } finally {
      setTargetBusyId(null);
    }
  };

  return (
    <div className="dashboard-drawer-overlay fixed inset-x-0 bottom-0 top-[76px] z-50 bg-black/45 backdrop-blur-sm">
      <button type="button" aria-label="Close drawer" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="dashboard-drawer animate-drawer-slide-in absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-white/10 bg-[#0d1011] text-zinc-100 shadow-[-24px_0_80px_rgba(0,0,0,0.42)]">
        <div className="dashboard-drawer-header flex items-center justify-between border-b border-white/10 bg-black/24 p-5">
          <div className="flex items-center gap-3">
            <div className="dashboard-drawer-icon flex h-11 w-11 items-center justify-center rounded-[4px] border border-[#4fa5b6]/28 bg-[#4fa5b6]/10 text-[#bdeeff]">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="dashboard-drawer-eyebrow text-xs font-semibold uppercase tracking-[0.16em] text-[#bdeeff]/70">{meta.eyebrow}</p>
              <h2 className="text-xl font-semibold text-zinc-50">{meta.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="dashboard-drawer-close flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors hover:text-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {notice && (
          <div className="dashboard-drawer-notice mx-5 mt-4 rounded-[4px] border border-[#4fa5b6]/24 bg-[#4fa5b6]/10 px-4 py-3 text-sm text-[#d9f7ff]">
            {notice}
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {panel === "search" && (
            <>
              <div className="dashboard-drawer-search flex h-12 items-center gap-3 rounded-[4px] border border-white/10 bg-black/28 px-4">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search scans, assets, categories..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  autoFocus
                />
              </div>
              <DrawerSection title="Results">
                <div className="space-y-2">
                  {visibleSearchItems.slice(0, 12).map((item) => (
                    <div key={`${item.type}-${item.label}`} className="dashboard-drawer-row flex items-center justify-between gap-4 rounded-[4px] border border-white/10 bg-black/18 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-200">{item.label}</p>
                        <p className="mt-1 text-xs text-zinc-500">{item.type}</p>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-500">{item.meta}</span>
                    </div>
                  ))}
                  {visibleSearchItems.length === 0 && <p className="text-sm text-zinc-500">No matching dashboard items.</p>}
                </div>
              </DrawerSection>
            </>
          )}

          {panel === "notifications" && (
            <>
              <DrawerSection title="Attention queue">
                {notificationsCleared ? (
                  <p className="text-sm text-zinc-500">All notifications are cleared for this session.</p>
                ) : (
                  <div className="space-y-2">
                    {dashboard.active_scans > 0 && <div className="dashboard-notice dashboard-notice-warning rounded-[4px] border border-[#ef5a2a]/18 bg-[#ef5a2a]/[0.06] p-3 text-sm text-orange-100">{dashboard.active_scans} scans are still running.</div>}
                    {dashboard.failed_scans > 0 && <div className="dashboard-notice dashboard-notice-danger rounded-[4px] border border-red-300/15 bg-red-300/[0.06] p-3 text-sm text-red-100">{dashboard.failed_scans} scans failed and may need review.</div>}
                    {dashboard.reports_ready > 0 && <div className="dashboard-notice dashboard-notice-info rounded-[4px] border border-[#4fa5b6]/18 bg-[#4fa5b6]/[0.06] p-3 text-sm text-[#d9f7ff]">{dashboard.reports_ready} reports are ready to open.</div>}
                    {dashboard.total_scans === 0 && <p className="text-sm text-zinc-500">No notifications yet.</p>}
                  </div>
                )}
              </DrawerSection>
              <ActionButton onClick={() => { setNotificationsCleared(true); showNotice("Notifications cleared."); }}>
                <CheckCircle2 className="h-4 w-4" /> Mark all read
              </ActionButton>
            </>
          )}

          {panel === "settings" && (
            <>
              <DrawerSection title="Verified scan targets">
                <div className="flex gap-2">
                  <input
                    value={targetInput}
                    onChange={(event) => setTargetInput(event.target.value)}
                    placeholder="example.com"
                    className="min-w-0 flex-1 rounded-[4px] border border-white/10 bg-black/28 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddTarget}
                    className="inline-flex h-10 items-center rounded-[4px] bg-white px-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {targets.map((target) => (
                    <div key={target.id} className="rounded-[4px] border border-white/10 bg-black/18 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-100">{target.domain}</p>
                          <p className="mt-1 font-mono text-[11px] text-zinc-500">{target.verification_record_name}</p>
                          <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">{target.verification_record_value}</p>
                        </div>
                        <span className={cn("rounded-[3px] px-2 py-1 text-[10px] font-semibold uppercase", target.status === "verified" ? "bg-[#4fa5b6]/12 text-[#d9f7ff]" : "bg-[#ef5a2a]/10 text-orange-200")}>
                          {target.status}
                        </span>
                      </div>
                      {target.status !== "verified" && (
                        <button
                          type="button"
                          onClick={() => handleVerifyTarget(target.id)}
                          disabled={targetBusyId === target.id}
                          className="mt-3 inline-flex h-8 items-center rounded-[3px] border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.07] disabled:opacity-60"
                        >
                          {targetBusyId === target.id ? "Checking" : "Verify DNS"}
                        </button>
                      )}
                    </div>
                  ))}
                  {targets.length === 0 && <p className="text-sm text-zinc-500">Add and verify a domain before starting customer scans.</p>}
                </div>
              </DrawerSection>
              <DrawerSection title="Workspace behavior">
                <ToggleRow label="Light dashboard theme" description="Switch the dashboard canvas, cards, drawers, and header to a bright B2B mode." checked={theme === "light"} checkedLabel="Light" uncheckedLabel="Dark" onChange={() => onThemeChange(theme === "light" ? "dark" : "light")} />
                <ToggleRow label="Auto-refresh dashboard" description="Refresh metrics while scans are active." checked={settings.autoRefresh} onChange={() => setSettings((prev) => ({ ...prev, autoRefresh: !prev.autoRefresh }))} />
                <ToggleRow label="Compact tables" description="Use tighter row spacing in dense scan views." checked={settings.compactTables} onChange={() => setSettings((prev) => ({ ...prev, compactTables: !prev.compactTables }))} />
                <ToggleRow label="Email completed reports" description="Send report-ready notifications to your account email." checked={settings.emailReports} onChange={() => setSettings((prev) => ({ ...prev, emailReports: !prev.emailReports }))} />
                <ToggleRow label="Include low severity" description="Keep low and info issues in report exports." checked={settings.includeLowSeverity} onChange={() => setSettings((prev) => ({ ...prev, includeLowSeverity: !prev.includeLowSeverity }))} />
                <ToggleRow label="Share PDF links" description="Expose PDF links inside completed report rows." checked={settings.sharePdfLinks} onChange={() => setSettings((prev) => ({ ...prev, sharePdfLinks: !prev.sharePdfLinks }))} />
              </DrawerSection>
              <ActionButton tone="primary" onClick={() => showNotice("Settings saved for this session.")}>
                <Settings className="h-4 w-4" /> Save settings
              </ActionButton>
            </>
          )}

          {panel === "account" && (
            <>
              <DrawerSection title="Signed-in operator">
                <div className="flex items-center gap-4">
                  <div className="dashboard-account-avatar flex h-14 w-14 items-center justify-center rounded-[4px] bg-[#4fa5b6]/15 text-lg font-semibold text-[#d9f7ff]">
                    {user?.name?.[0]?.toUpperCase() || <UserRound className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">{user?.name || "Operator"}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500">{user?.email || "signed in"}</p>
                    <p className="dashboard-account-role mt-2 text-xs uppercase tracking-[0.16em] text-[#bdeeff]/70">{user?.role || "user"}</p>
                  </div>
                </div>
              </DrawerSection>
              <DrawerSection title="Usage">
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Plan" value={usage?.plan || "beta"} />
                  <MiniStat label="Monthly" value={`${usage?.monthly_scans_used ?? dashboard.total_scans}/${usage?.monthly_scan_limit ?? "--"}`} />
                  <MiniStat label="Active" value={`${usage?.active_scans ?? dashboard.active_scans}/${usage?.active_scan_limit ?? "--"}`} />
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  Target verification is {usage?.requires_target_verification ? "required" : "optional"} for this workspace.
                </p>
              </DrawerSection>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="min-h-full bg-[#090b0d] p-6">
      <div className="space-y-5">
        <Skeleton className="h-12 rounded-lg bg-white/8" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => (
            <Skeleton key={item} className="h-36 rounded-lg bg-white/8" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg bg-white/8" />
      </div>
    </div>
  );
}

function WorkspaceHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ElementType;
  children?: React.ReactNode;
}) {
  return (
    <section className="dashboard-hero mesh-grain-panel rounded-[6px] border border-white/10 bg-[linear-gradient(90deg,rgba(18,63,77,0.45),rgba(9,11,12,0.95)_48%,rgba(239,90,42,0.16)),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[length:auto,72px_100%] p-5 md:p-7">
      <div className="grid gap-6 xl:grid-cols-[1fr_520px] xl:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-[3px] border border-[#4fa5b6]/24 bg-[#4fa5b6]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#d9f7ff]">
            <Icon className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-zinc-50 md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>
        </div>
        {children && <div>{children}</div>}
      </div>
    </section>
  );
}

function WorkspaceEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="dashboard-workspace-empty rounded-[4px] border border-dashed border-white/12 bg-black/20 p-6 text-sm text-zinc-500">
      <p className="font-semibold text-zinc-200">{title}</p>
      <p className="mt-2 leading-6">{text}</p>
    </div>
  );
}

function HelpTooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500 outline-none transition-colors hover:border-[#4fa5b6]/40 hover:text-[#d9f7ff] focus:border-[#4fa5b6]/50 focus:text-[#d9f7ff]"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-8 z-20 hidden w-72 rounded-[4px] border border-white/10 bg-[#080a0b] p-3 text-left text-xs leading-5 text-zinc-300 shadow-[0_20px_60px_rgba(0,0,0,0.45)] group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

function findingSeverityClass(severity: PersistentFinding["severity"]) {
  return cn(
    severity === "critical" && "border-red-300/20 bg-red-300/10 text-red-200",
    severity === "high" && "border-[#ef5a2a]/25 bg-[#ef5a2a]/10 text-orange-200",
    severity === "medium" && "border-amber-300/20 bg-amber-300/10 text-amber-100",
    severity === "low" && "border-[#4fa5b6]/24 bg-[#4fa5b6]/10 text-[#d9f7ff]",
    severity === "info" && "border-white/10 bg-white/[0.04] text-zinc-300"
  );
}

function findingStatusClass(status: PersistentFinding["status"]) {
  return cn(
    status === "new" && "border-[#4fa5b6]/24 bg-[#4fa5b6]/10 text-[#d9f7ff]",
    status === "triaged" && "border-amber-300/20 bg-amber-300/10 text-amber-100",
    status === "accepted" && "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    status === "duplicate" && "border-white/10 bg-white/[0.04] text-zinc-300",
    status === "false_positive" && "border-zinc-400/15 bg-zinc-400/10 text-zinc-300",
    status === "fixed" && "border-[#4fa5b6]/20 bg-[#4fa5b6]/8 text-[#bdeeff]",
    status === "regressed" && "border-red-300/24 bg-red-300/10 text-red-200"
  );
}

function gateStatusClass(status: ReleaseGate["status"]) {
  return cn(
    status === "pass" && "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    status === "warn" && "border-amber-300/20 bg-amber-300/10 text-amber-100",
    status === "block" && "border-red-300/24 bg-red-300/10 text-red-200"
  );
}

function previewStatusClass(preview: ScopePreview) {
  return preview.allowed
    ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
    : "border-red-300/24 bg-red-300/10 text-red-200";
}

function FindingsTriageTable({
  findings,
  updatingFindingId,
  onStatusChange,
}: {
  findings: PersistentFinding[];
  updatingFindingId: string | null;
  onStatusChange: (findingId: string, status: PersistentFinding["status"]) => void;
}) {
  if (findings.length === 0) {
    return (
      <WorkspaceEmpty
        title="No persistent findings yet"
        text="New completed scans now create durable finding records. Historical reports still appear in the summary panels until new findings are created."
      />
    );
  }

  return (
    <div className="mt-5 overflow-x-auto rounded-[4px] border border-white/10">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-white/8 bg-black/24 text-left text-xs text-zinc-500">
            <th className="px-3 py-3 font-medium">Finding</th>
            <th className="px-3 py-3 font-medium">Severity</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Affected</th>
            <th className="px-3 py-3 font-medium">Last seen</th>
            <th className="px-3 py-3 text-right font-medium">Triage</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => (
            <tr key={finding.id} className="border-b border-white/6 last:border-0 hover:bg-white/[0.025]">
              <td className="max-w-[320px] px-3 py-3">
                <p className="truncate font-semibold text-zinc-100">{finding.title}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{finding.category}</p>
              </td>
              <td className="px-3 py-3">
                <span className={cn("inline-flex rounded-[3px] border px-2.5 py-1 text-xs font-semibold", findingSeverityClass(finding.severity))}>
                  {finding.severity}
                </span>
              </td>
              <td className="px-3 py-3">
                <span className={cn("inline-flex rounded-[3px] border px-2.5 py-1 text-xs font-semibold", findingStatusClass(finding.status))}>
                  {finding.status.replace("_", " ")}
                </span>
              </td>
              <td className="max-w-[260px] truncate px-3 py-3 font-mono text-xs text-zinc-400" title={finding.affected}>
                {finding.affected}
              </td>
              <td className="px-3 py-3 text-xs text-zinc-500">
                {new Date(finding.last_seen_at).toLocaleString()}
              </td>
              <td className="px-3 py-3 text-right">
                <select
                  value={finding.status}
                  disabled={updatingFindingId === finding.id}
                  onChange={(event) => onStatusChange(finding.id, event.target.value as PersistentFinding["status"])}
                  className="h-9 rounded-[3px] border border-white/10 bg-[#0b0e0f] px-2 text-xs font-semibold text-zinc-200 outline-none transition-colors focus:border-[#4fa5b6]/60 disabled:opacity-60"
                  aria-label={`Update status for ${finding.title}`}
                >
                  {FINDING_STATUSES.map((status) => (
                    <option key={status} value={status}>{status.replace("_", " ")}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProgramsWorkspace({
  programs,
  scopeRules,
  authProfilesByProgram,
  assets,
  onChanged,
}: {
  programs: Program[];
  scopeRules: Record<string, ScopeRule[]>;
  authProfilesByProgram: Record<string, AuthProfile[]>;
  assets: Asset[];
  onChanged: () => Promise<void>;
}) {
  const [programName, setProgramName] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [ruleType, setRuleType] = useState<ScopeRule["rule_type"]>("in_scope");
  const [pattern, setPattern] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMode, setAuthMode] = useState<AuthProfileMode>("cookie");
  const [authValue, setAuthValue] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [customHeaderName, setCustomHeaderName] = useState("Authorization");
  const [scopePreview, setScopePreview] = useState<ScopePreview | null>(null);
  const [releaseGate, setReleaseGate] = useState<ReleaseGate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedProgram = programs.find((program) => program.id === selectedProgramId) || programs[0] || null;
  const selectedRules = selectedProgram ? scopeRules[selectedProgram.id] || [] : [];
  const selectedAuthProfiles = selectedProgram ? authProfilesByProgram[selectedProgram.id] || [] : [];

  const refreshReleaseGate = useCallback(async (programId: string) => {
    try {
      setReleaseGate(await getProgramReleaseGate(programId));
    } catch (err) {
      setReleaseGate(null);
      setError(err instanceof Error ? err.message : "Failed to load release gate.");
    }
  }, []);

  const handleCreateProgram = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("program");
    setError(null);
    try {
      const program = await createProgram({
        name: programName.trim(),
        scan_intensity: "standard",
      });
      setProgramName("");
      setSelectedProgramId(program.id);
      await onChanged();
      await refreshReleaseGate(program.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create program.");
    } finally {
      setBusy(null);
    }
  };

  const handleCreateRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProgram) return;
    setBusy("scope");
    setError(null);
    try {
      await createProgramScopeRule(selectedProgram.id, {
        rule_type: ruleType,
        asset_type: inferScopeAssetType(pattern),
        pattern: pattern.trim(),
      });
      setPattern("");
      await onChanged();
      await refreshReleaseGate(selectedProgram.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add scope rule.");
    } finally {
      setBusy(null);
    }
  };

  const handleCreateAuthProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProgram) return;
    setBusy("auth");
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (authMode === "cookie") {
        headers.Cookie = authValue.trim();
      } else if (authMode === "bearer") {
        headers.Authorization = authValue.trim().toLowerCase().startsWith("bearer ")
          ? authValue.trim()
          : `Bearer ${authValue.trim()}`;
      } else if (authMode === "basic") {
        headers.Authorization = `Basic ${window.btoa(`${authUsername}:${authPassword}`)}`;
      } else {
        headers[customHeaderName.trim()] = authValue.trim();
      }
      await createAuthProfile(selectedProgram.id, {
        name: authName.trim() || defaultAuthProfileName(authMode),
        headers,
      });
      setAuthName("");
      setAuthValue("");
      setAuthUsername("");
      setAuthPassword("");
      setCustomHeaderName("Authorization");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save auth profile.");
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAuthProfile = async (profileId: string) => {
    setBusy(`auth:${profileId}`);
    setError(null);
    try {
      await deleteAuthProfile(profileId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete auth profile.");
    } finally {
      setBusy(null);
    }
  };

  const handlePreviewScope = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProgram) return;
    setBusy("preview");
    setError(null);
    try {
      setScopePreview(await previewProgramScope(selectedProgram.id, previewUrl.trim()));
    } catch (err) {
      setScopePreview(null);
      setError(err instanceof Error ? err.message : "Failed to preview scope.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Program scope"
        title="Bug bounty scope is now a first-class workspace."
        description="Create programs, define in-scope and out-of-scope rules, then connect assets and findings to the same source of truth."
        icon={ClipboardList}
      >
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Programs" value={programs.length} variant="hero" />
          <MiniStat label="Scope rules" value={Object.values(scopeRules).reduce((total, rules) => total + rules.length, 0)} variant="hero" />
          <MiniStat label="Assets" value={assets.length} variant="hero" />
        </div>
      </WorkspaceHero>

      {error && (
        <div className="rounded-[4px] border border-red-300/18 bg-red-300/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <DashboardCard>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-zinc-50">Create program</h2>
                <HelpTooltip label="What is a program?" text="A program groups one bug bounty or internal assessment. Scans, scope rules, auth profiles, assets, and findings are tied back to this workspace." />
              </div>
              <p className="mt-1 text-sm text-zinc-500">Use one program per bounty scope or internal assessment.</p>
            </div>
            <Target className="h-5 w-5 text-[#4fa5b6]" />
          </div>
          <form onSubmit={handleCreateProgram} className="space-y-3">
            <input
              value={programName}
              onChange={(event) => setProgramName(event.target.value)}
              placeholder="Program name, e.g. Acme bounty"
              className="h-11 w-full rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
              required
            />
            <button
              type="submit"
              disabled={busy === "program"}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
            >
              <ClipboardList className="h-4 w-4" />
              {busy === "program" ? "Creating" : "Create program"}
            </button>
          </form>

          <div className="mt-6 space-y-2">
            {programs.map((program) => (
              <button
                key={program.id}
                type="button"
                onClick={() => {
                  setSelectedProgramId(program.id);
                  setScopePreview(null);
                  void refreshReleaseGate(program.id);
                }}
                className={cn(
                  "w-full rounded-[4px] border p-3 text-left transition-colors",
                  selectedProgram?.id === program.id
                    ? "border-[#4fa5b6]/32 bg-[#4fa5b6]/10"
                    : "border-white/10 bg-black/18 hover:bg-white/[0.04]"
                )}
              >
                <p className="truncate text-sm font-semibold text-zinc-100">{program.name}</p>
                <p className="mt-1 truncate font-mono text-xs text-zinc-500">{program.handle || program.id.slice(0, 8)}</p>
              </button>
            ))}
            {programs.length === 0 && (
              <WorkspaceEmpty title="No programs yet" text="Create your first program to start separating scope, assets, and findings." />
            )}
          </div>
        </DashboardCard>

        <div className="space-y-4">
          <DashboardCard>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-zinc-50">Release gate</h2>
                  <HelpTooltip label="What is the release gate?" text="The release gate summarizes whether this program is safe to ship based on active scope, blocking critical or high findings, failed scans, and open warnings." />
                </div>
                <p className="mt-1 text-sm text-zinc-500">{selectedProgram ? selectedProgram.name : "Select or create a program"}</p>
              </div>
              <div className="flex items-center gap-3">
                {selectedProgram && (
                  <button
                    type="button"
                    onClick={() => void refreshReleaseGate(selectedProgram.id)}
                    className="inline-flex h-9 items-center justify-center rounded-[3px] border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08]"
                  >
                    Refresh
                  </button>
                )}
                <ShieldCheck className="h-5 w-5 text-[#4fa5b6]" />
              </div>
            </div>

            {selectedProgram && releaseGate ? (
              <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <div className={cn("rounded-[4px] border p-4", gateStatusClass(releaseGate.status))}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Gate</p>
                  <p className="mt-2 text-4xl font-semibold uppercase tracking-tight">{releaseGate.status}</p>
                  <p className="mt-3 text-xs opacity-80">
                    {new Date(releaseGate.generated_at).toLocaleString()}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[4px] border border-white/10 bg-black/18 p-4">
                    <p className="text-sm font-semibold text-zinc-100">Blockers</p>
                    {releaseGate.blockers.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-red-100">
                        {releaseGate.blockers.slice(0, 3).map((item) => (
                          <li key={item} className="line-clamp-2">{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-zinc-500">No blocking critical or high issues.</p>
                    )}
                  </div>
                  <div className="rounded-[4px] border border-white/10 bg-black/18 p-4">
                    <p className="text-sm font-semibold text-zinc-100">Warnings</p>
                    {releaseGate.warnings.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-amber-100">
                        {releaseGate.warnings.slice(0, 3).map((item) => (
                          <li key={item} className="line-clamp-2">{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-zinc-500">No medium issue or failed-scan warnings.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <WorkspaceEmpty title="No gate yet" text="Create a program and add in-scope rules to get a production gate result." />
            )}
          </DashboardCard>

          <DashboardCard>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-zinc-50">Auth profiles</h2>
                  <HelpTooltip label="What is an auth profile?" text="An auth profile stores encrypted request headers, such as a Cookie or Authorization token, so scans can test logged-in routes without showing saved secrets back in the UI." />
                </div>
                <p className="mt-1 text-sm text-zinc-500">Store scanner cookies or bearer tokens for logged-in coverage.</p>
              </div>
              <UserRound className="h-5 w-5 text-[#4fa5b6]" />
            </div>

            {selectedProgram ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.82fr)_1fr]">
                <form onSubmit={handleCreateAuthProfile} className="space-y-3">
                  <input
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    placeholder={`${defaultAuthProfileName(authMode)} name`}
                    className="h-11 w-full rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
                  />
                  <select
                    value={authMode}
                    onChange={(event) => setAuthMode(event.target.value as AuthProfileMode)}
                    className="h-11 w-full rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none focus:border-[#4fa5b6]/60"
                  >
                    <option value="cookie">Cookie session</option>
                    <option value="bearer">Bearer token</option>
                    <option value="basic">Basic username/password</option>
                    <option value="header">Custom header</option>
                  </select>
                  {authMode === "header" && (
                    <input
                      value={customHeaderName}
                      onChange={(event) => setCustomHeaderName(event.target.value)}
                      placeholder="Header name"
                      className="h-11 w-full rounded-[4px] border border-white/10 bg-black/24 px-3 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
                      required
                    />
                  )}
                  {authMode === "basic" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        value={authUsername}
                        onChange={(event) => setAuthUsername(event.target.value)}
                        placeholder="Username"
                        className="h-11 rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
                        required
                      />
                      <input
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        placeholder="Password"
                        type="password"
                        className="h-11 rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
                        required
                      />
                    </div>
                  ) : (
                    <textarea
                      value={authValue}
                      onChange={(event) => setAuthValue(event.target.value)}
                      placeholder={authMode === "cookie" ? "session=abc123; csrf=..." : authMode === "bearer" ? "paste token only, or Bearer token" : "Header value"}
                      className="min-h-24 w-full rounded-[4px] border border-white/10 bg-black/24 p-3 font-mono text-xs leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
                      spellCheck={false}
                      required
                    />
                  )}
                  <button
                    type="submit"
                    disabled={busy === "auth"}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {busy === "auth" ? "Encrypting" : "Save auth profile"}
                  </button>
                </form>

                <div className="space-y-2">
                  {selectedAuthProfiles.map((profile) => (
                    <div key={profile.id} className="grid gap-3 rounded-[4px] border border-white/10 bg-black/18 p-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-100">{profile.name}</p>
                        <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                          {profile.header_names.join(", ") || "headers stored"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAuthProfile(profile.id)}
                        disabled={busy === `auth:${profile.id}`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[3px] border border-red-300/18 bg-red-300/10 px-3 text-xs font-semibold text-red-100 transition-colors hover:bg-red-300/16 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  ))}
                  {selectedAuthProfiles.length === 0 && (
                    <WorkspaceEmpty title="No auth profiles yet" text="Add a cookie or authorization header for authenticated route coverage." />
                  )}
                </div>
              </div>
            ) : (
              <WorkspaceEmpty title="Program needed" text="Create a program first, then auth profiles can be attached to it." />
            )}
          </DashboardCard>

          <DashboardCard>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-zinc-50">Scope preview</h2>
                  <HelpTooltip label="What is scope preview?" text="Scope preview checks a target URL against active in-scope and out-of-scope rules before a scan starts, so accidental out-of-scope scans are blocked early." />
                </div>
                <p className="mt-1 text-sm text-zinc-500">Check a URL against program scope before launching a scan.</p>
              </div>
              <Radar className="h-5 w-5 text-[#ef5a2a]" />
            </div>

            {selectedProgram ? (
              <>
                <form onSubmit={handlePreviewScope} className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto]">
                  <input
                    value={previewUrl}
                    onChange={(event) => setPreviewUrl(event.target.value)}
                    placeholder="https://staging.example.com"
                    className="h-11 rounded-[4px] border border-white/10 bg-black/24 px-3 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
                    required
                  />
                  <button
                    type="submit"
                    disabled={busy === "preview"}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[4px] bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
                  >
                    {busy === "preview" ? "Checking" : "Preview"}
                  </button>
                </form>
                {scopePreview && (
                  <div className={cn("mt-4 rounded-[4px] border p-4", previewStatusClass(scopePreview))}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold">{scopePreview.allowed ? "Allowed" : "Blocked"}</p>
                      <span className="font-mono text-xs opacity-80">{scopePreview.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-2 text-sm opacity-90">{scopePreview.message}</p>
                    <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                      <div>
                        <p className="font-semibold uppercase tracking-[0.14em] opacity-70">Matched in scope</p>
                        <p className="mt-1 font-mono">{scopePreview.matched_in_scope_rules.map((rule) => rule.pattern).join(", ") || "none"}</p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase tracking-[0.14em] opacity-70">Matched out of scope</p>
                        <p className="mt-1 font-mono">{scopePreview.matched_out_of_scope_rules.map((rule) => rule.pattern).join(", ") || "none"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <WorkspaceEmpty title="Program needed" text="Scope preview needs a selected program." />
            )}
          </DashboardCard>

          <DashboardCard>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-zinc-50">Scope rules</h2>
                  <HelpTooltip label="What are scope rules?" text="Scope rules define what the scanner is allowed to touch. Use in-scope rules for approved domains, URLs, paths, IPs, or CIDRs, and out-of-scope rules for excluded surfaces." />
                </div>
                <p className="mt-1 text-sm text-zinc-500">{selectedProgram ? selectedProgram.name : "Select or create a program"}</p>
              </div>
              <SlidersHorizontal className="h-5 w-5 text-[#ef5a2a]" />
            </div>

            {selectedProgram ? (
              <>
                <form onSubmit={handleCreateRule} className="grid gap-3 lg:grid-cols-[150px_minmax(220px,1fr)_auto]">
                  <select
                    value={ruleType}
                    onChange={(event) => setRuleType(event.target.value as ScopeRule["rule_type"])}
                    className="h-11 rounded-[4px] border border-white/10 bg-black/24 px-3 text-sm text-zinc-100 outline-none focus:border-[#4fa5b6]/60"
                  >
                    <option value="in_scope">In scope</option>
                    <option value="out_of_scope">Out of scope</option>
                  </select>
                  <input
                    value={pattern}
                    onChange={(event) => setPattern(event.target.value)}
                    placeholder="example.com, *.example.com, /admin/*, or 10.0.0.0/24"
                    className="h-11 rounded-[4px] border border-white/10 bg-black/24 px-3 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#4fa5b6]/60"
                    required
                  />
                  <button
                    type="submit"
                    disabled={busy === "scope"}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[4px] bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-60"
                  >
                    Add rule
                  </button>
                </form>

                <div className="mt-5 grid gap-2">
                  {selectedRules.map((rule) => (
                    <div key={rule.id} className="grid gap-3 rounded-[4px] border border-white/10 bg-black/18 p-3 md:grid-cols-[110px_90px_1fr] md:items-center">
                      <span className={cn("w-fit rounded-[3px] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", rule.rule_type === "in_scope" ? "bg-[#4fa5b6]/12 text-[#d9f7ff]" : "bg-[#ef5a2a]/10 text-orange-200")}>
                        {rule.rule_type.replace("_", " ")}
                      </span>
                      <span className="font-mono text-xs text-zinc-500">{rule.asset_type}</span>
                      <span className="truncate font-mono text-sm text-zinc-200" title={rule.pattern}>{rule.pattern}</span>
                    </div>
                  ))}
                  {selectedRules.length === 0 && (
                    <WorkspaceEmpty title="No scope rules yet" text="Add at least one in-scope rule, then use out-of-scope rules to protect excluded surfaces." />
                  )}
                </div>
              </>
            ) : (
              <WorkspaceEmpty title="Program needed" text="Create a program first, then scope rules can be attached to it." />
            )}
          </DashboardCard>

          <DashboardCard>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-zinc-50">Recent assets</h2>
                  <HelpTooltip label="What are recent assets?" text="Recent assets are targets and affected surfaces retained from completed scans and findings, linked back to the selected program for triage." />
                </div>
                <p className="mt-1 text-sm text-zinc-500">Assets are populated by completed scans and finding persistence.</p>
              </div>
              <Boxes className="h-5 w-5 text-[#4fa5b6]" />
            </div>
            {assets.length === 0 ? (
              <WorkspaceEmpty title="No assets retained yet" text="New findings will create assets automatically; explicit recon assets can be added in the next slice." />
            ) : (
              <div className="grid gap-2">
                {assets.slice(0, 10).map((asset) => (
                  <div key={asset.id} className="grid gap-3 rounded-[4px] border border-white/10 bg-black/18 p-3 md:grid-cols-[110px_1fr_180px] md:items-center">
                    <span className="rounded-[3px] border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-semibold text-zinc-300">{asset.asset_type}</span>
                    <span className="truncate font-mono text-sm text-zinc-200" title={asset.value}>{asset.value}</span>
                    <span className="text-xs text-zinc-500">Seen {new Date(asset.last_seen_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

function SurfaceWorkspace({
  dashboard,
  programs,
  authProfilesByProgram,
  assets,
  onRefresh,
}: {
  dashboard: ScanDashboardResponse;
  programs: Program[];
  authProfilesByProgram: Record<string, AuthProfile[]>;
  assets: Asset[];
  onRefresh: () => Promise<void>;
}) {
  const assetItems = dashboard.top_assets.map((item) => ({ label: item.asset, count: item.count }));
  const classifiedAssets = assets.filter((asset) => asset.metadata_json?.ai_label || asset.metadata_json?.surface_role);
  const loginCandidates = classifiedAssets.filter((asset) => String(asset.metadata_json?.surface_role || "").includes("login")).length;

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Attack surface"
        title="Subdomains, routes, and sensitive entry points in one map."
        description="Completed scans retain discovered hosts, crawled routes, API candidates, and likely login or admin areas so the next scan can focus where abuse would happen."
        icon={Boxes}
      >
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Assets" value={assets.length} variant="hero" />
          <MiniStat label="Classified" value={classifiedAssets.length} variant="hero" />
          <MiniStat label="Login" value={loginCandidates} variant="hero" />
        </div>
      </WorkspaceHero>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-50">Most affected assets</h2>
              <p className="mt-1 text-sm text-zinc-500">Prioritized by retained findings across completed reports.</p>
            </div>
            <Target className="h-5 w-5 text-[#4fa5b6]" />
          </div>
          <BarList items={assetItems} emptyTitle="No affected assets yet" emptyText="Run a completed scan and affected targets will appear here." />
        </DashboardCard>

        <DashboardCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-50">Launch surface scan</h2>
              <p className="mt-1 text-sm text-zinc-500">Keep this page for the map; open utility settings only when needed.</p>
            </div>
            <Play className="h-5 w-5 text-[#ef5a2a]" />
          </div>
          <QuickScanForm onCreated={onRefresh} programs={programs} authProfilesByProgram={authProfilesByProgram} />
          <CommandFlowPreview />
        </DashboardCard>
      </div>

      <SurfaceInventory assets={assets} />
    </div>
  );
}

function surfacePriorityClass(priority: unknown) {
  if (priority === "high") return "border-[#ef5a2a]/40 bg-[#ef5a2a]/10 text-orange-100";
  if (priority === "medium") return "border-[#e7b84b]/35 bg-[#e7b84b]/10 text-yellow-100";
  if (priority === "low") return "border-white/10 bg-white/[0.04] text-zinc-400";
  return "border-[#4fa5b6]/25 bg-[#4fa5b6]/10 text-[#d9f7ff]";
}

function SurfaceInventory({ assets }: { assets: Asset[] }) {
  const sortedAssets = [...assets].sort((a, b) => {
    const rank = { high: 0, medium: 1, normal: 2, low: 3 };
    const aPriority = String(a.metadata_json?.priority || "normal") as keyof typeof rank;
    const bPriority = String(b.metadata_json?.priority || "normal") as keyof typeof rank;
    return (rank[aPriority] ?? 2) - (rank[bPriority] ?? 2) || new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });

  return (
    <DashboardCard>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-50">Discovered subdomains and routes</h2>
          <p className="mt-1 text-sm text-zinc-500">Likely login, admin, API, docs, upload, and operational routes are labeled from scanner evidence.</p>
        </div>
        <Radar className="h-5 w-5 text-[#4fa5b6]" />
      </div>
      {sortedAssets.length === 0 ? (
        <WorkspaceEmpty title="No surface map yet" text="Run a scan and discovered subdomains, routes, API candidates, and login-like paths will appear here." />
      ) : (
        <div className="grid gap-2">
          {sortedAssets.slice(0, 100).map((asset) => {
            const label = String(asset.metadata_json?.ai_label || asset.asset_type);
            const role = String(asset.metadata_json?.surface_role || asset.asset_type);
            const priority = String(asset.metadata_json?.priority || "normal");
            const signals = Array.isArray(asset.metadata_json?.signals) ? asset.metadata_json.signals.map(String).slice(0, 2) : [];
            return (
              <div key={asset.id} className="grid gap-3 rounded-[4px] border border-white/10 bg-black/18 p-3 lg:grid-cols-[150px_minmax(0,1fr)_180px] lg:items-center">
                <div className="flex flex-wrap gap-2">
                  <span className={cn("rounded-[3px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", surfacePriorityClass(priority))}>
                    {role.replaceAll("_", " ")}
                  </span>
                  <span className="rounded-[3px] border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    {asset.source}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-zinc-100" title={asset.value}>{asset.value}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{label}{signals.length ? ` · ${signals.join(", ")}` : ""}</p>
                </div>
                <span className="text-xs text-zinc-500">Seen {new Date(asset.last_seen_at).toLocaleString()}</span>
              </div>
            );
          })}
          {sortedAssets.length > 100 && <p className="pt-2 text-xs text-zinc-500">Showing first 100 of {sortedAssets.length} discovered assets.</p>}
        </div>
      )}
    </DashboardCard>
  );
}

function ScansWorkspace({
  dashboard,
  schedules,
  defaultTimezone,
  filter,
  stoppingScanId,
  stopError,
  onStopScan,
  onSchedulesChanged,
}: {
  dashboard: ScanDashboardResponse;
  schedules: ScheduledScan[];
  defaultTimezone: string;
  filter: ScanFilter;
  stoppingScanId: string | null;
  stopError: string | null;
  onStopScan: (scanId: string) => void;
  onSchedulesChanged: () => Promise<void>;
}) {
  const filteredScans = dashboard.recent_scans.filter((scan) => {
    if (filter === "active") return scan.status === "running" || scan.status === "pending";
    if (filter === "failed") return scan.status === "failed";
    if (filter === "complete") return scan.status === "complete";
    return true;
  });
  const filterLabels: Record<ScanFilter, string> = {
    all: "All",
    active: "Active",
    failed: "Failed",
    complete: "Complete",
  };

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Scan command"
        title="Open the exact scan queue from the metric cards."
        description="Total, active, and failed scan metrics now land on this page with the relevant scan rows already filtered."
        icon={Globe2}
      >
        <div className="grid grid-cols-4 gap-3">
          <MiniStat label="Total" value={dashboard.total_scans} variant="hero" />
          <MiniStat label="Active" value={dashboard.active_scans} variant="hero" />
          <MiniStat label="Failed" value={dashboard.failed_scans} variant="hero" />
          <MiniStat label="Complete" value={dashboard.complete_scans} variant="hero" />
        </div>
      </WorkspaceHero>

      <div className="flex flex-wrap gap-2">
        {SCAN_FILTERS.map((item) => (
          <Link
            key={item}
            href={item === "all" ? "/dashboard?view=scans" : `/dashboard?view=scans&status=${item}`}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-[3px] border px-4 text-sm font-semibold transition-colors",
              filter === item
                ? "border-[#4fa5b6]/36 bg-[#4fa5b6]/14 text-[#d9f7ff]"
                : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.075]"
            )}
          >
            {filterLabels[item]}
          </Link>
        ))}
      </div>

      <ScanTable
        scans={filteredScans}
        stoppingScanId={stoppingScanId}
        stopError={stopError}
        onStopScan={onStopScan}
        emptyTitle={`No ${filterLabels[filter].toLowerCase()} scans`}
        emptyText="The selected scan queue is empty right now."
      />

      <ScheduleManager schedules={schedules} onChanged={onSchedulesChanged} defaultTimezone={defaultTimezone} />
    </div>
  );
}

function FindingsWorkspace({
  dashboard,
  findings,
  updatingFindingId,
  onFindingStatusChange,
}: {
  dashboard: ScanDashboardResponse;
  findings: PersistentFinding[];
  updatingFindingId: string | null;
  onFindingStatusChange: (findingId: string, status: PersistentFinding["status"]) => void;
}) {
  const severityTotal = dashboard.total_findings;
  const openFindings = findings.filter((finding) => !["fixed", "false_positive", "duplicate"].includes(finding.status)).length;

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Finding triage"
        title="Persistent findings are ready for triage."
        description="New scans now create durable finding records with status, affected asset, evidence summary, and dedupe keys. This page is the operator queue."
        icon={ShieldAlert}
      >
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Persistent" value={findings.length} variant="hero" />
          <MiniStat label="Open" value={openFindings} variant="hero" />
          <MiniStat label="Report total" value={severityTotal} variant="hero" />
        </div>
      </WorkspaceHero>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <DashboardCard>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-50">Severity profile</h2>
            <span className="text-sm text-zinc-500">{severityTotal} total</span>
          </div>
          {severityTotal === 0 ? (
            <WorkspaceEmpty title="No retained findings" text="Completed reports with findings will populate this risk profile." />
          ) : (
            <SeverityBars counts={dashboard.severity_counts} total={severityTotal} />
          )}
        </DashboardCard>

        <DashboardCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-50">Category breakdown</h2>
              <p className="mt-1 text-sm text-zinc-500">Use this as the triage map before opening reports.</p>
            </div>
            <SlidersHorizontal className="h-5 w-5 text-[#4fa5b6]" />
          </div>
          <BarList items={dashboard.category_counts} emptyTitle="No categories yet" emptyText="Completed reports will populate category triage." />
        </DashboardCard>
      </div>

      <DashboardCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-50">Triage queue</h2>
            <p className="mt-1 text-sm text-zinc-500">Change status here; the dashboard immediately treats findings as durable records.</p>
          </div>
          <Bug className="h-5 w-5 text-[#ef5a2a]" />
        </div>
        <FindingsTriageTable
          findings={findings}
          updatingFindingId={updatingFindingId}
          onStatusChange={onFindingStatusChange}
        />
      </DashboardCard>
    </div>
  );
}

function ReportsWorkspace({ dashboard }: { dashboard: ScanDashboardResponse }) {
  const completeScans = dashboard.recent_scans.filter((scan) => scan.status === "complete");

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Report center"
        title="PDF handoffs live on their own page."
        description="Reports get a clean full-screen index for completed scans, ready PDFs, and evidence handoff. The drawer is reserved for utility actions, not primary page content."
        icon={FileText}
      >
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Ready" value={dashboard.reports_ready} variant="hero" />
          <MiniStat label="Complete" value={dashboard.complete_scans} variant="hero" />
          <MiniStat label="Total scans" value={dashboard.total_scans} variant="hero" />
        </div>
      </WorkspaceHero>

      <DashboardCard>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-50">Completed reports</h2>
            <p className="mt-1 text-sm text-zinc-500">Open the sharp B2B PDF report from the scan row.</p>
          </div>
          <Download className="h-5 w-5 text-[#4fa5b6]" />
        </div>
        {completeScans.length === 0 ? (
          <WorkspaceEmpty title="No completed reports yet" text="Finished scans will show here with direct access to the report page." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {completeScans.map((scan) => (
              <Link key={scan.id} href={`/report/${scan.id}`} className="block transition-transform hover:-translate-y-0.5">
                <ScanRow scan={scan} />
              </Link>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

function PrimaryWorkspacePage({
  view,
  dashboard,
  schedules,
  programs,
  scopeRules,
  authProfilesByProgram,
  assets,
  findings,
  defaultTimezone,
  onRefresh,
  onSchedulesChanged,
  onBugBountyChanged,
  updatingFindingId,
  onFindingStatusChange,
  scanFilter,
  stoppingScanId,
  stopError,
  onStopScan,
}: {
  view: ViewId;
  dashboard: ScanDashboardResponse;
  schedules: ScheduledScan[];
  programs: Program[];
  scopeRules: Record<string, ScopeRule[]>;
  authProfilesByProgram: Record<string, AuthProfile[]>;
  assets: Asset[];
  findings: PersistentFinding[];
  defaultTimezone: string;
  onRefresh: () => Promise<void>;
  onSchedulesChanged: () => Promise<void>;
  onBugBountyChanged: () => Promise<void>;
  updatingFindingId: string | null;
  onFindingStatusChange: (findingId: string, status: PersistentFinding["status"]) => void;
  scanFilter: ScanFilter;
  stoppingScanId: string | null;
  stopError: string | null;
  onStopScan: (scanId: string) => void;
}) {
  if (view === "surface") {
    return <SurfaceWorkspace dashboard={dashboard} programs={programs} authProfilesByProgram={authProfilesByProgram} assets={assets} onRefresh={onRefresh} />;
  }
  if (view === "programs") {
    return (
      <ProgramsWorkspace
        programs={programs}
        scopeRules={scopeRules}
        authProfilesByProgram={authProfilesByProgram}
        assets={assets}
        onChanged={onBugBountyChanged}
      />
    );
  }
  if (view === "scans") {
    return (
      <ScansWorkspace
        dashboard={dashboard}
        schedules={schedules}
        defaultTimezone={defaultTimezone}
        filter={scanFilter}
        stoppingScanId={stoppingScanId}
        stopError={stopError}
        onStopScan={onStopScan}
        onSchedulesChanged={onSchedulesChanged}
      />
    );
  }
  if (view === "findings") {
    return (
      <FindingsWorkspace
        dashboard={dashboard}
        findings={findings}
        updatingFindingId={updatingFindingId}
        onFindingStatusChange={onFindingStatusChange}
      />
    );
  }
  if (view === "reports") return <ReportsWorkspace dashboard={dashboard} />;
  return <SurfaceWorkspace dashboard={dashboard} programs={programs} authProfilesByProgram={authProfilesByProgram} assets={assets} onRefresh={onRefresh} />;
}

function DashboardPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<ScanDashboardResponse>(EMPTY_DASHBOARD);
  const [schedules, setSchedules] = useState<ScheduledScan[]>([]);
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [targets, setTargets] = useState<ScanTarget[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [scopeRules, setScopeRules] = useState<Record<string, ScopeRule[]>>({});
  const [authProfilesByProgram, setAuthProfilesByProgram] = useState<Record<string, AuthProfile[]>>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [findings, setFindings] = useState<PersistentFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [stoppingScanId, setStoppingScanId] = useState<string | null>(null);
  const [updatingFindingId, setUpdatingFindingId] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [theme, setTheme] = useState<DashboardTheme>("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [scheduleDraftUrl, setScheduleDraftUrl] = useState("");
  const [scheduleFocusSignal, setScheduleFocusSignal] = useState(0);
  const liveRefreshTimer = useRef<number | null>(null);
  const scheduleSectionRef = useRef<HTMLDivElement | null>(null);

  const legacyBooleanView =
    (searchParams.get("surface") && "surface") ||
    (searchParams.get("programs") && "programs") ||
    (searchParams.get("rules") && "programs") ||
    (searchParams.get("findings") && "findings") ||
    (searchParams.get("reports") && "reports") ||
    null;
  const panelParam = searchParams.get("panel");
  const legacyPanelView = VIEW_IDS.includes(panelParam as ViewId) ? panelParam : null;
  const viewParam = searchParams.get("view") || legacyPanelView || legacyBooleanView;
  const activeView = VIEW_IDS.includes(viewParam as ViewId) ? (viewParam as ViewId) : null;
  const activePanel = PANEL_IDS.includes(panelParam as PanelId) ? (panelParam as PanelId) : null;
  const statusParam = searchParams.get("status");
  const scanFilter = SCAN_FILTERS.includes(statusParam as ScanFilter) ? (statusParam as ScanFilter) : "all";

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    const data = await getScanDashboard();
    setDashboard(data);
  }, [user]);

  const loadSchedules = useCallback(async () => {
    if (!user) return;
    const data = await listSchedules();
    setSchedules(data);
  }, [user]);

  const loadAccountControls = useCallback(async () => {
    if (!user) return;
    const [usageData, targetData] = await Promise.all([getAccountUsage(), listScanTargets()]);
    setUsage(usageData);
    setTargets(targetData);
  }, [user]);

  const loadBugBountyData = useCallback(async () => {
    if (!user) return;
    const [programData, assetData, findingData] = await Promise.all([
      listPrograms(),
      listAssets({ limit: 500 }),
      listFindings({ limit: 100 }),
    ]);
    const scopeEntries = await Promise.all(
      programData.map(async (program) => [program.id, await listProgramScope(program.id)] as const)
    );
    const authEntries = await Promise.all(
      programData.map(async (program) => [program.id, await listAuthProfiles(program.id)] as const)
    );
    setPrograms(programData);
    setAssets(assetData);
    setFindings(findingData);
    setScopeRules(Object.fromEntries(scopeEntries));
    setAuthProfilesByProgram(Object.fromEntries(authEntries));
  }, [user]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(DASHBOARD_THEME_KEY) === "light" ? "light" : "dark";
    document.documentElement.dataset.scanaiDashboardTheme = savedTheme;
    window.queueMicrotask(() => {
      setTheme(savedTheme);
      setThemeLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    document.documentElement.dataset.scanaiDashboardTheme = theme;
    window.localStorage.setItem(DASHBOARD_THEME_KEY, theme);
    window.dispatchEvent(new CustomEvent("scanai-dashboard-theme", { detail: theme }));
  }, [theme, themeLoaded]);

  useEffect(() => {
    async function load() {
      if (authLoading) return;

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        await Promise.all([loadDashboard(), loadSchedules(), loadAccountControls(), loadBugBountyData()]);
      } catch (err) {
        console.error("Failed to load dashboard", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [authLoading, loadDashboard, loadSchedules, loadAccountControls, loadBugBountyData, user]);

  useEffect(() => {
    if (authLoading || !user) return;

    let websocket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByComponent = false;

    const scheduleDashboardRefresh = () => {
      if (liveRefreshTimer.current) {
        window.clearTimeout(liveRefreshTimer.current);
      }
      liveRefreshTimer.current = window.setTimeout(() => {
        Promise.all([loadDashboard(), loadBugBountyData()]).catch((err) => console.error("Failed to refresh dashboard from scan event", err));
      }, 150);
    };

    const connect = () => {
      websocket = new WebSocket(getScanEventsWebSocketUrl());
      websocket.onmessage = (event) => {
        let message: ScanEventMessage;
        try {
          message = JSON.parse(event.data) as ScanEventMessage;
        } catch {
          return;
        }
        if (message.type === "scan.events.connected") return;
        scheduleDashboardRefresh();
      };
      websocket.onclose = () => {
        if (!closedByComponent) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
      websocket.onerror = () => {
        websocket?.close();
      };
    };

    connect();

    return () => {
      closedByComponent = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (liveRefreshTimer.current) window.clearTimeout(liveRefreshTimer.current);
      websocket?.close();
    };
  }, [authLoading, loadDashboard, loadBugBountyData, user]);

  const handleStopScan = async (scanId: string) => {
    setStoppingScanId(scanId);
    setStopError(null);
    try {
      await cancelScan(scanId);
      await loadDashboard();
    } catch (err: unknown) {
      console.error("Failed to stop scan", err);
      setStopError(err instanceof Error ? err.message : "Failed to stop scan.");
    } finally {
      setStoppingScanId(null);
    }
  };

  const handleFindingStatusChange = async (findingId: string, status: PersistentFinding["status"]) => {
    setUpdatingFindingId(findingId);
    try {
      const updated = await updateFindingStatus(findingId, status);
      setFindings((current) => current.map((finding) => (finding.id === findingId ? updated : finding)));
      await loadDashboard();
    } catch (err) {
      console.error("Failed to update finding status", err);
    } finally {
      setUpdatingFindingId(null);
    }
  };

  const handleScheduleFromHero = useCallback((target: string) => {
    setScheduleDraftUrl(target);
    setScheduleFocusSignal((current) => current + 1);
    scheduleSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (authLoading || loading) {
    return <DashboardLoading />;
  }

  const severityTotal = dashboard.total_findings;
  const assetItems = dashboard.top_assets.map((item) => ({
    label: item.asset,
    count: item.count,
  }));
  const drawerCloseHref = activeView ? `/dashboard?view=${activeView}` : "/dashboard";

  return (
    <div className={cn("dashboard-shell mesh-grain-canvas min-h-[calc(100vh-76px)] bg-[radial-gradient(circle_at_16%_0%,rgba(79,165,182,0.14),transparent_30%),radial-gradient(circle_at_85%_12%,rgba(239,90,42,0.1),transparent_28%),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),#070808] bg-[length:auto,auto,72px_100%] p-4 text-zinc-100 sm:p-6", theme === "light" && "dashboard-theme-light")}>
      <div className="mx-auto max-w-[1780px] space-y-4">
        <ActiveScanBanner scans={dashboard.recent_scans} />
        {activeView ? (
          <PrimaryWorkspacePage
            view={activeView}
            dashboard={dashboard}
            schedules={schedules}
            programs={programs}
            scopeRules={scopeRules}
            authProfilesByProgram={authProfilesByProgram}
            assets={assets}
            findings={findings}
            defaultTimezone={user?.timezone || "UTC"}
            onRefresh={loadDashboard}
            onSchedulesChanged={loadSchedules}
            onBugBountyChanged={loadBugBountyData}
            updatingFindingId={updatingFindingId}
            onFindingStatusChange={handleFindingStatusChange}
            scanFilter={scanFilter}
            stoppingScanId={stoppingScanId}
            stopError={stopError}
            onStopScan={handleStopScan}
          />
        ) : (
          <>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(380px,0.7fr)]">
          <section className="dashboard-hero mesh-grain-panel rounded-[6px] border border-white/10 bg-[linear-gradient(90deg,rgba(18,63,77,0.5),rgba(10,12,13,0.94)_46%,rgba(239,90,42,0.2)),linear-gradient(90deg,rgba(255,255,255,0.062)_1px,transparent_1px)] bg-[length:auto,72px_100%] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] md:p-7">
            <div className="max-w-4xl">
              <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#d9f7ff]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Live external surface
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
                Scan a target. Get the risk story.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Welcome back, {user?.name || "Operator"}. Start with a URL; the dashboard stays focused on posture, reports, and follow-up.
              </p>
              <div className="mt-6 max-w-2xl">
                <QuickScanForm
                  onCreated={loadDashboard}
                  onSchedule={handleScheduleFromHero}
                  programs={programs}
                  authProfilesByProgram={authProfilesByProgram}
                  variant="hero"
                />
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-white/42">
                Crawl / triage / report
              </p>
            </div>
          </section>

          <DashboardCard className="flex flex-col justify-between bg-[#151815]/92">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-50">Average risk</h2>
                <p className="mt-1 text-sm text-zinc-500">Across completed reports</p>
              </div>
              <ShieldAlert className="h-5 w-5 text-[#ef5a2a]" />
            </div>
            <RiskGauge value={dashboard.average_risk_score} />
          </DashboardCard>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_1.25fr_1fr_1fr_1fr_1fr]">
          <MetricTile icon={Globe2} label="Total scans" value={dashboard.total_scans} tone="emerald" featured href="/dashboard?view=scans" />
          <MetricTile icon={Target} label="Findings" value={dashboard.total_findings} tone="red" featured href="/dashboard?view=findings" />
          <MetricTile icon={ClipboardList} label="Programs" value={programs.length} tone="sky" href="/dashboard?view=programs" />
          <MetricTile icon={Clock3} label="Active scans" value={dashboard.active_scans} tone="sky" href="/dashboard?view=scans&status=active" />
          <MetricTile icon={Layers3} label="Reports ready" value={dashboard.reports_ready} tone="amber" href="/dashboard?view=reports" />
          <MetricTile icon={XCircle} label="Failed scans" value={dashboard.failed_scans} tone="red" href="/dashboard?view=scans&status=failed" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <DashboardCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-zinc-50">Scan trend</h2>
                <p className="mt-1 text-sm text-zinc-500">Real scans and retained findings by day</p>
              </div>
              <BarChart3 className="h-5 w-5 text-[#4fa5b6]" />
            </div>
            <ActivityChart data={dashboard.scans_by_day} />
          </DashboardCard>

          <DashboardCard>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-50">Finding severity</h2>
              <span className="text-sm text-zinc-500">{severityTotal} total</span>
            </div>
            {severityTotal === 0 ? (
              <EmptyPanel title="No retained findings" text="Completed reports with findings will populate this severity breakdown." />
            ) : (
              <SeverityBars counts={dashboard.severity_counts} total={severityTotal} />
            )}
          </DashboardCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.72fr_0.72fr_1.26fr]">
          <DashboardCard>
            <h2 className="text-xl font-semibold text-zinc-50">Finding categories</h2>
            <BarList
              items={dashboard.category_counts}
              emptyTitle="No categories yet"
              emptyText="Categories are derived from completed report findings."
            />
          </DashboardCard>

          <DashboardCard>
            <h2 className="text-xl font-semibold text-zinc-50">Top affected assets</h2>
            <BarList
              items={assetItems}
              emptyTitle="No affected assets yet"
              emptyText="Affected assets are derived from the real findings inside completed reports."
            />
          </DashboardCard>

          <ScanTable
            scans={dashboard.recent_scans}
            stoppingScanId={stoppingScanId}
            stopError={stopError}
            onStopScan={handleStopScan}
            limit={5}
            viewMoreHref="/dashboard?view=scans"
          />
        </div>

        <div ref={scheduleSectionRef} id="scheduled-checkups" className="scroll-mt-24">
          <ScheduleManager
            schedules={schedules}
            onChanged={loadSchedules}
            prefillUrl={scheduleDraftUrl}
            focusSignal={scheduleFocusSignal}
            defaultTimezone={user?.timezone || "UTC"}
          />
        </div>

        {dashboard.total_scans === 0 && (
          <DashboardCard className="border-[#4fa5b6]/22 bg-[#4fa5b6]/[0.045]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <FileText className="mt-1 h-5 w-5 text-[#4fa5b6]" />
                <div>
                  <h2 className="font-semibold text-zinc-100">This dashboard is waiting for real scan data.</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Start your Docker dev stack with `make dev`, sign in, run a scan, and these panels will populate from Postgres reports.
                  </p>
                </div>
              </div>
            </div>
          </DashboardCard>
        )}
          </>
        )}
      </div>
      <DashboardPanelDrawer
        panel={activePanel}
        dashboard={dashboard}
        usage={usage}
        targets={targets}
        user={user}
        theme={theme}
        onThemeChange={setTheme}
        onClose={() => router.push(drawerCloseHref)}
        onTargetsChanged={loadAccountControls}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPageContent />
    </Suspense>
  );
}
