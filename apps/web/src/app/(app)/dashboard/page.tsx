"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Ban,
  Bell,
  Bot,
  Boxes,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Globe2,
  Layers3,
  Play,
  Radar,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TerminalSquare,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  cancelScan,
  createScan,
  getScanDashboard,
  type DashboardCategoryCount,
  type DashboardDayCount,
  type DashboardRecentScan,
  type ScanDashboardResponse,
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
  variant = "default",
}: {
  onCreated: () => void;
  variant?: "default" | "hero";
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const heroVariant = variant === "hero";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Enter a target URL.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scanUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const { scan_id } = await createScan(scanUrl);
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
          "dashboard-input-shell scan-input-shell flex gap-2 rounded-[4px] border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          heroVariant ? "border-white/18 bg-black/34" : "border-white/10 bg-black/30"
        )}
      >
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
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-[3px] bg-white px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
          {loading ? "Starting" : "Run"}
        </button>
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
  | "scans"
  | "findings"
  | "reports"
  | "agents";

type ScanFilter = "all" | "active" | "failed" | "complete";

type PanelId =
  | "activity"
  | "radar"
  | "notifications"
  | "settings"
  | "search"
  | "account";

const VIEW_IDS: ViewId[] = ["surface", "scans", "findings", "reports", "agents"];
const SCAN_FILTERS: ScanFilter[] = ["all", "active", "failed", "complete"];

const PANEL_TITLES: Record<PanelId, { title: string; eyebrow: string; icon: React.ElementType }> = {
  activity: { title: "Live Activity", eyebrow: "Recent scan events", icon: Activity },
  radar: { title: "API Radar", eyebrow: "Routes and signals", icon: Radar },
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
  emptyTitle = "No scans yet",
  emptyText = "Run a target scan to populate this command view.",
}: {
  scans: DashboardRecentScan[];
  stoppingScanId: string | null;
  stopError: string | null;
  onStopScan: (scanId: string) => void;
  emptyTitle?: string;
  emptyText?: string;
}) {
  return (
    <DashboardCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-50">Recent scans</h2>
        <div className="flex items-center gap-3">
          {stopError && <span className="text-xs text-red-300">{stopError}</span>}
          <span className="text-sm text-zinc-500">{scans.length} shown</span>
        </div>
      </div>
      {scans.length === 0 ? (
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
              {scans.map((scan) => (
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

function DashboardPanelDrawer({
  panel,
  dashboard,
  user,
  theme,
  onThemeChange,
  onClose,
  onRefresh,
}: {
  panel: PanelId | null;
  dashboard: ScanDashboardResponse;
  user: { name?: string; email?: string; role?: string } | null;
  theme: DashboardTheme;
  onThemeChange: (theme: DashboardTheme) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
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

  if (!panel) return null;

  const meta = PANEL_TITLES[panel];
  const Icon = meta.icon;
  const completeScans = dashboard.recent_scans.filter((scan) => scan.status === "complete");
  const activeScans = dashboard.recent_scans.filter((scan) => scan.status === "running" || scan.status === "pending");
  const failedScans = dashboard.recent_scans.filter((scan) => scan.status === "failed");
  const visibleSearchItems = [
    ...dashboard.recent_scans.map((scan) => ({ type: "Scan", label: scan.url, meta: `${scan.status} · ${scan.findings_count} findings` })),
    ...dashboard.top_assets.map((asset) => ({ type: "Asset", label: asset.asset, meta: `${asset.count} findings` })),
    ...dashboard.category_counts.map((category) => ({ type: "Category", label: category.label, meta: `${category.count} findings` })),
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
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

          {panel === "activity" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Running" value={activeScans.length} />
                <MiniStat label="Completed" value={completeScans.length} />
                <MiniStat label="Failed" value={failedScans.length} />
              </div>
              <DrawerSection title="Recent events">
                <div className="space-y-2">
                  {dashboard.recent_scans.slice(0, 10).map((scan) => <ScanRow key={scan.id} scan={scan} />)}
                  {dashboard.recent_scans.length === 0 && <p className="text-sm text-zinc-500">No scan activity yet.</p>}
                </div>
              </DrawerSection>
              <ActionButton tone="primary" onClick={() => { onRefresh(); showNotice("Dashboard refreshed."); }}>
                <RefreshCw className="h-4 w-4" /> Refresh now
              </ActionButton>
            </>
          )}

          {panel === "radar" && (
            <>
              <DrawerSection title="API and exposure signals">
                <div className="space-y-2">
                  {dashboard.category_counts.slice(0, 8).map((category) => (
                    <div key={category.label} className="dashboard-drawer-row flex items-center justify-between rounded-[4px] border border-white/10 bg-black/18 p-3">
                      <span className="text-sm text-zinc-200">{category.label}</span>
                      <span className="dashboard-drawer-count font-mono text-xs text-[#d9f7ff]">{category.count}</span>
                    </div>
                  ))}
                  {dashboard.category_counts.length === 0 && <p className="text-sm text-zinc-500">No API signals retained yet.</p>}
                </div>
              </DrawerSection>
              <ActionButton onClick={() => showNotice("Radar view pinned to dashboard.")}>
                <Radar className="h-4 w-4" /> Pin radar
              </ActionButton>
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
                  <MiniStat label="Scans" value={dashboard.total_scans} />
                  <MiniStat label="Reports" value={dashboard.reports_ready} />
                  <MiniStat label="Findings" value={dashboard.total_findings} />
                </div>
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

function SurfaceWorkspace({
  dashboard,
  onRefresh,
}: {
  dashboard: ScanDashboardResponse;
  onRefresh: () => Promise<void>;
}) {
  const assetItems = dashboard.top_assets.map((item) => ({ label: item.asset, count: item.count }));

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Attack surface"
        title="Every exposed asset gets a real workspace."
        description="Surface is now a full page for domains, reachable paths, affected assets, and fresh scan launch. Utility controls stay in drawers; this page stays focused on what is reachable."
        icon={Boxes}
      >
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Assets" value={dashboard.top_assets.length} variant="hero" />
          <MiniStat label="Active" value={dashboard.active_scans} variant="hero" />
          <MiniStat label="Failed" value={dashboard.failed_scans} variant="hero" />
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
          <QuickScanForm onCreated={onRefresh} />
          <CommandFlowPreview />
        </DashboardCard>
      </div>
    </div>
  );
}

function ScansWorkspace({
  dashboard,
  filter,
  stoppingScanId,
  stopError,
  onStopScan,
}: {
  dashboard: ScanDashboardResponse;
  filter: ScanFilter;
  stoppingScanId: string | null;
  stopError: string | null;
  onStopScan: (scanId: string) => void;
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
    </div>
  );
}

function FindingsWorkspace({ dashboard }: { dashboard: ScanDashboardResponse }) {
  const severityTotal = dashboard.total_findings;
  const severityItems = Object.entries(dashboard.severity_counts);

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Finding triage"
        title="Risk first, categories second, noise last."
        description="The findings page gives severity and category triage the full screen so reviewers can see what matters before opening individual reports."
        icon={ShieldAlert}
      >
        <div className="grid grid-cols-5 gap-2">
          {severityItems.map(([severity, count]) => (
            <div key={severity} className="rounded-[4px] border border-white/10 bg-black/24 p-3 text-center">
              <p className="font-mono text-2xl font-semibold text-zinc-50">{count}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">{severity}</p>
            </div>
          ))}
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
          <ActionButton>
            <Download className="h-4 w-4" /> Prepare bundle
          </ActionButton>
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

function AgentsWorkspace({ dashboard }: { dashboard: ScanDashboardResponse }) {
  const router = useRouter();
  const [profileSaved, setProfileSaved] = useState(false);
  const modules = [
    { title: "Discovery", text: "Subdomains, linked hosts, and first reachable paths.", icon: Radar, status: "Active" },
    { title: "Crawler", text: "Routes, docs, forms, and API-like paths.", icon: Globe2, status: "Active" },
    { title: "Posture", text: "TLS, headers, exposed admin paths, and scanner signals.", icon: ShieldCheck, status: "Active" },
    { title: "Report writer", text: "Executive summary, risk framing, and fix prompts.", icon: FileText, status: "Ready" },
  ];

  const handleSaveProfile = () => {
    window.localStorage.setItem(
      "scanai-agent-profile",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        modules: modules.map(({ title, status }) => ({ title, status })),
      })
    );
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2200);
  };

  return (
    <div className="space-y-4">
      <WorkspaceHero
        eyebrow="Scan agents"
        title="Agent modules get a full configuration surface."
        description="Agents are a primary workspace because they control what each scan does. Settings still live in the drawer; scan behavior lives here."
        icon={Bot}
      >
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Modules" value={modules.length} variant="hero" />
          <MiniStat label="Active scans" value={dashboard.active_scans} variant="hero" />
          <MiniStat label="Reports" value={dashboard.reports_ready} variant="hero" />
        </div>
      </WorkspaceHero>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="grid gap-4 md:grid-cols-2">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <DashboardCard key={module.title}>
                <div className="flex items-start justify-between gap-4">
                  <div className="dashboard-module-icon flex h-11 w-11 items-center justify-center rounded-[4px] border border-[#4fa5b6]/24 bg-[#4fa5b6]/10 text-[#bdeeff]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-[3px] border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    {module.status}
                  </span>
                </div>
                <h2 className="mt-6 text-xl font-semibold text-zinc-50">{module.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{module.text}</p>
              </DashboardCard>
            );
          })}
        </div>

        <DashboardCard className="mesh-grain-panel bg-[linear-gradient(150deg,rgba(79,165,182,0.12),rgba(255,255,255,0.035)_48%,rgba(239,90,42,0.12))]">
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <Sparkles className="h-6 w-6 text-[#ef5a2a]" />
              <h2 className="mt-5 text-2xl font-semibold text-zinc-50">Default evidence profile</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Crawl, probe, collect reachable evidence, and produce owner-ready remediation prompts without opening extra navigation.
              </p>
              {profileSaved && (
                <p className="dashboard-agent-save-notice mt-4 rounded-[4px] border border-[#4fa5b6]/24 bg-[#4fa5b6]/10 px-3 py-2 text-sm font-medium text-[#d9f7ff]">
                  Evidence profile saved for this browser.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton tone="primary" onClick={handleSaveProfile}>
                <Sparkles className="h-4 w-4" /> {profileSaved ? "Saved" : "Save profile"}
              </ActionButton>
              <ActionButton onClick={() => router.push("/dashboard?view=agents&panel=settings")}>
                <Settings className="h-4 w-4" /> Open settings drawer
              </ActionButton>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}

function PrimaryWorkspacePage({
  view,
  dashboard,
  onRefresh,
  scanFilter,
  stoppingScanId,
  stopError,
  onStopScan,
}: {
  view: ViewId;
  dashboard: ScanDashboardResponse;
  onRefresh: () => Promise<void>;
  scanFilter: ScanFilter;
  stoppingScanId: string | null;
  stopError: string | null;
  onStopScan: (scanId: string) => void;
}) {
  if (view === "surface") return <SurfaceWorkspace dashboard={dashboard} onRefresh={onRefresh} />;
  if (view === "scans") {
    return (
      <ScansWorkspace
        dashboard={dashboard}
        filter={scanFilter}
        stoppingScanId={stoppingScanId}
        stopError={stopError}
        onStopScan={onStopScan}
      />
    );
  }
  if (view === "findings") return <FindingsWorkspace dashboard={dashboard} />;
  if (view === "reports") return <ReportsWorkspace dashboard={dashboard} />;
  return <AgentsWorkspace dashboard={dashboard} />;
}

function DashboardPageContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<ScanDashboardResponse>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [stoppingScanId, setStoppingScanId] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [theme, setTheme] = useState<DashboardTheme>("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);

  const legacyBooleanView =
    (searchParams.get("surface") && "surface") ||
    (searchParams.get("findings") && "findings") ||
    (searchParams.get("reports") && "reports") ||
    (searchParams.get("agents") && "agents") ||
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
        await loadDashboard();
      } catch (err) {
        console.error("Failed to load dashboard", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [authLoading, loadDashboard, user]);

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
        {activeView ? (
          <PrimaryWorkspacePage
            view={activeView}
            dashboard={dashboard}
            onRefresh={loadDashboard}
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
                <QuickScanForm onCreated={loadDashboard} variant="hero" />
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr]">
          <MetricTile icon={Globe2} label="Total scans" value={dashboard.total_scans} tone="emerald" featured href="/dashboard?view=scans" />
          <MetricTile icon={Target} label="Findings" value={dashboard.total_findings} tone="red" featured href="/dashboard?view=findings" />
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
        user={user}
        theme={theme}
        onThemeChange={setTheme}
        onClose={() => router.push(drawerCloseHref)}
        onRefresh={loadDashboard}
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
