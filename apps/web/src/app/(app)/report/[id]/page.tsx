"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  ShieldAlert,
} from "lucide-react";
import {
  generateScanPDF,
  getScan,
  getScanPDFDownloadUrl,
  getScanPDFViewUrl,
  type Finding,
  type ScanStatusResponse,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "border-red-300/25 bg-red-300/10 text-red-200",
  high: "border-orange-300/25 bg-orange-300/10 text-orange-200",
  medium: "border-amber-300/25 bg-amber-300/10 text-amber-200",
  low: "border-sky-300/25 bg-sky-300/10 text-sky-200",
  info: "border-zinc-300/20 bg-zinc-300/10 text-zinc-300",
};

function severityLabel(severity: string): Severity {
  return SEVERITY_ORDER.includes(severity as Severity) ? severity as Severity : "info";
}

function RiskGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(score, 100));
  const circumference = 2 * Math.PI * 46;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 80 ? "#f87171" : clamped >= 60 ? "#fb923c" : clamped >= 40 ? "#facc15" : clamped >= 20 ? "#60a5fa" : "#34d399";

  return (
    <div className="report-risk-gauge relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle className="report-risk-track" cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          className="report-risk-value"
          cx="60"
          cy="60"
          r="46"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="report-risk-number font-mono text-4xl font-semibold text-zinc-50">{clamped}</span>
        <span className="report-risk-caption text-[10px] font-medium uppercase text-zinc-500">risk score</span>
      </div>
    </div>
  );
}

function buildFixPrompt(finding: Finding) {
  const remediation = Array.isArray(finding.how_to_fix)
    ? finding.how_to_fix.map((step) => `- ${step}`).join("\n")
    : "- Implement the safest fix that removes the vulnerable behavior.";

  return [
    "You are working in my local codebase as a senior application security engineer. Please inspect the implementation that serves the affected asset, fix the security issue, and add focused regression tests without changing unrelated behavior.",
    "",
    `Finding: ${finding.title}`,
    `Severity: ${finding.severity}`,
    `Category: ${finding.category || "other"}`,
    `Affected asset: ${finding.affected || "Unknown"}`,
    `Evidence from scanner: ${finding.evidence || "No concise evidence provided."}`,
    `Risk explanation: ${finding.what_it_means || "Review the scanner evidence and verify impact in the codebase."}`,
    "",
    "Expected remediation:",
    remediation,
    "",
    "Acceptance criteria:",
    "- Identify the exact route, handler, middleware, config, or dependency responsible.",
    "- Implement the smallest durable fix.",
    "- Add or update tests that would have failed before the fix.",
    "- Run the relevant lint/test/build commands and summarize the changed files.",
  ].join("\n");
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const scanId = params.id as string;

  const [scan, setScan] = useState<ScanStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [openFindingId, setOpenFindingId] = useState<string | null>(null);
  const [copiedFindingId, setCopiedFindingId] = useState<string | null>(null);
  const [copiedAllPrompts, setCopiedAllPrompts] = useState(false);
  const autoPdfScanRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getScan(scanId);
        if (data.status !== "complete") {
          router.push(`/scan/${scanId}`);
          return;
        }
        setScan(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load report.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scanId, router]);

  useEffect(() => {
    if (!scan?.report || scan.pdf_url || autoPdfScanRef.current === scanId) return;

    autoPdfScanRef.current = scanId;
    async function renderPdf() {
      try {
        setGeneratingPdf(true);
        const result = await generateScanPDF(scanId);
        setScan((prev) => (prev ? { ...prev, pdf_url: result.pdf_url } : prev));
      } catch (err) {
        console.error("Failed to auto-generate PDF", err);
      } finally {
        setGeneratingPdf(false);
      }
    }

    void renderPdf();
  }, [scan, scanId]);

  const sortedFindings = useMemo(() => {
    if (!scan?.report?.findings) return [];
    return [...scan.report.findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(severityLabel(a.severity)) - SEVERITY_ORDER.indexOf(severityLabel(b.severity))
    );
  }, [scan]);

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    sortedFindings.forEach((finding) => {
      counts[severityLabel(finding.severity)] += 1;
    });
    return counts;
  }, [sortedFindings]);

  if (loading) {
    return (
      <main className="min-h-full bg-[#090b0d] p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <Skeleton className="h-40 rounded-lg bg-white/8" />
          <Skeleton className="h-80 rounded-lg bg-white/8" />
        </div>
      </main>
    );
  }

  if (error || !scan?.report) {
    return (
      <main className="flex min-h-full items-center justify-center bg-[#090b0d] p-6 text-zinc-100">
        <div className="rounded-lg border border-red-300/20 bg-red-300/10 p-6 text-center">
          <p className="text-sm text-red-100">{error || "Report not available."}</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-4 h-10 rounded-md bg-red-300 px-4 text-sm font-semibold text-zinc-950"
          >
            Back to dashboard
          </button>
        </div>
      </main>
    );
  }

  const report = scan.report;
  const attackSurface = report._visuals?.attack_surface;
  const apiSurface = report._visuals?.api_surface;
  const webIntelligence = report._visuals?.web_intelligence;
  const assurance = report._visuals?.assurance;
  const apiRoutes = apiSurface?.candidate_routes || [];
  const apiDocs = apiSurface?.documentation_endpoints || [];
  const parameterizedRoutes = apiSurface?.parameterized_routes || [];
  const schemas = apiSurface?.schemas || [];
  const missingHeaders = webIntelligence?.missing_security_headers || [];
  const serverFingerprints = Object.entries(webIntelligence?.server_fingerprints || {});
  const technologyFingerprints = webIntelligence?.technology_fingerprints || [];
  const wafDetection = webIntelligence?.waf_detection;

  async function handleGeneratePdf() {
    try {
      setGeneratingPdf(true);
      const result = await generateScanPDF(scanId);
      setScan((prev) => (prev ? { ...prev, pdf_url: result.pdf_url } : prev));
      window.open(getScanPDFViewUrl(scanId), "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate PDF.";
      setError(message);
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleCopyFixPrompt(finding: Finding) {
    const prompt = finding.fix_prompt?.trim() || buildFixPrompt(finding);
    await navigator.clipboard.writeText(prompt);
    setCopiedFindingId(finding.id);
    window.setTimeout(() => setCopiedFindingId((current) => (current === finding.id ? null : current)), 1600);
  }

  async function handleCopyAllFixPrompts() {
    const promptBundle = sortedFindings
      .map((finding, index) => {
        const prompt = finding.fix_prompt?.trim() || buildFixPrompt(finding);
        return `# Finding ${index + 1}: ${finding.title}\n\n${prompt}`;
      })
      .join("\n\n---\n\n");

    await navigator.clipboard.writeText(promptBundle);
    setCopiedAllPrompts(true);
    window.setTimeout(() => setCopiedAllPrompts(false), 1800);
  }

  return (
    <main className="report-page mesh-grain-canvas min-h-full bg-[radial-gradient(circle_at_16%_0%,rgba(79,165,182,0.14),transparent_30%),radial-gradient(circle_at_86%_4%,rgba(239,90,42,0.12),transparent_28%),#070808] p-4 text-zinc-100 sm:p-6">
      <div className="mx-auto flex max-w-[1780px]">
        <div className="report-frame animate-drawer-slide-in w-full space-y-5 rounded-[12px] border border-white/10 bg-[#101415]/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6">
        <section className="report-hero mesh-grain-panel rounded-[8px] border border-white/10 bg-[linear-gradient(90deg,rgba(18,63,77,0.68),rgba(8,9,9,0.92)_46%,rgba(239,90,42,0.42)),linear-gradient(90deg,rgba(255,255,255,0.09)_1px,transparent_1px)] bg-[length:auto,72px_100%] p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="report-back-link mb-5 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </button>
              <div className="report-status-pill mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <FileText className="h-3.5 w-3.5" />
                Security report
              </div>
              <h1 className="text-3xl font-semibold text-zinc-50 md:text-4xl">Security Report</h1>
              <p className="mt-2 break-all font-mono text-sm text-zinc-500">{scan.url}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {scan.pdf_url ? (
                <a
                  href={getScanPDFDownloadUrl(scanId)}
                  className="report-button inline-flex h-10 items-center gap-2 rounded-sm border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.07]"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                  className="report-button inline-flex h-10 items-center gap-2 rounded-sm border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className={cn("h-4 w-4", generatingPdf && "animate-pulse")} />
                  {generatingPdf ? "Generating..." : "Generate PDF"}
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[0.42fr_0.58fr]">
          <section className="report-card rounded-[10px] border border-white/8 bg-white/[0.035] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-50">Risk posture</h2>
              <ShieldAlert className="h-5 w-5 text-amber-300" />
            </div>
            <RiskGauge score={report.risk_score} />
            <div className="mt-6 grid grid-cols-2 gap-2">
              {SEVERITY_ORDER.map((severity) => (
                <div key={severity} className={cn("report-severity-tile rounded-sm border px-3 py-2", `report-severity-${severity}`, SEVERITY_STYLES[severity])}>
                  <p className="text-[10px] font-semibold uppercase">{severity}</p>
                  <p className="mt-1 font-mono text-lg font-semibold">{severityCounts[severity]}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="report-card rounded-[10px] border border-white/8 bg-white/[0.035] p-6">
            <h2 className="text-xl font-semibold text-zinc-50">AI summary</h2>
            <p className="mt-5 text-lg leading-8 text-zinc-300">{report.summary}</p>
            {report.priority_actions && report.priority_actions.length > 0 && (
              <div className="mt-7">
                <h3 className="mb-3 text-sm font-semibold text-zinc-500">Priority actions</h3>
                <div className="space-y-2">
                  {report.priority_actions.map((action, index) => (
                    <div key={`${action}-${index}`} className="flex gap-3 rounded-sm border border-white/8 bg-white/[0.03] p-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <p className="text-sm text-zinc-300">{action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="report-card rounded-[10px] border border-white/8 bg-white/[0.035] p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-50">Endpoint surface</h2>
              <p className="mt-1 text-sm text-zinc-500">Routes and API documentation candidates observed during crawling.</p>
            </div>
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-zinc-400">
              {(apiSurface?.candidate_route_count || 0) + (apiSurface?.documentation_endpoint_count || 0)} API signals
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Live hosts", attackSurface?.live_hosts ?? 0],
              ["DNS records", attackSurface?.dns_records ?? 0],
              ["Open ports", attackSurface?.open_ports ?? 0],
              ["Crawled endpoints", attackSurface?.crawled_endpoints ?? 0],
              ["API routes", attackSurface?.api_routes ?? 0],
              ["Param endpoints", attackSurface?.parameterized_endpoints ?? 0],
              ["Schemas", attackSurface?.api_schemas ?? 0],
              ["TLS inventory", attackSurface?.tls_inventory ?? 0],
              ["API signals", attackSurface?.api_signals ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-sm border border-white/8 bg-white/[0.03] p-3">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-zinc-100">{value}</p>
              </div>
            ))}
          </div>

          {webIntelligence && (
            <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-sm border border-white/8 bg-black/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Website intelligence</p>
                    <p className="mt-2 truncate font-mono text-xs text-zinc-400">{webIntelligence.final_url || scan.url}</p>
                  </div>
                  <span className="rounded-full bg-white/8 px-2.5 py-1 font-mono text-xs text-zinc-300">
                    {webIntelligence.response_time_ms ?? 0}ms
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    ["Header score", webIntelligence.security_header_score ?? "n/a"],
                    ["Cookies", webIntelligence.cookie_summary?.count ?? 0],
                    ["DNSSEC", webIntelligence.dnssec?.enabled ? "on" : "off"],
                    ["DMARC", webIntelligence.mail_security?.dmarc_policy || (webIntelligence.mail_security?.has_dmarc ? "set" : "missing")],
                    ["WAF", wafDetection?.detected ? wafDetection.name || "detected" : wafDetection?.skipped ? "skipped" : "none"],
                    ["Tech", technologyFingerprints.length],
                    ["robots.txt", webIntelligence.robots?.available ? "found" : "missing"],
                    ["security.txt", webIntelligence.security_txt?.available ? "found" : "missing"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded border border-white/8 bg-white/[0.03] p-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                      <p className="mt-1 truncate font-mono text-sm font-semibold text-zinc-100">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-sm border border-white/8 bg-black/15 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Missing hardening headers</p>
                  <div className="space-y-2">
                    {missingHeaders.slice(0, 6).map((item) => (
                      <p key={item.header} className="truncate rounded bg-orange-300/[0.07] px-2 py-1.5 font-mono text-xs text-orange-100">
                        {item.header}
                      </p>
                    ))}
                    {missingHeaders.length === 0 && <p className="text-sm text-zinc-500">No missing high-signal browser headers retained.</p>}
                  </div>
                </div>
                <div className="rounded-sm border border-white/8 bg-black/15 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Server fingerprints</p>
                  <div className="space-y-2">
                    {serverFingerprints.slice(0, 6).map(([name, value]) => (
                      <p key={name} className="truncate rounded bg-sky-300/[0.06] px-2 py-1.5 font-mono text-xs text-sky-100">
                        {name}: {value}
                      </p>
                    ))}
                    {serverFingerprints.length === 0 && <p className="text-sm text-zinc-500">No explicit server fingerprint headers observed.</p>}
                  </div>
                </div>
                <div className="rounded-sm border border-white/8 bg-black/15 p-4 md:col-span-2">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Technology fingerprints</p>
                  <div className="flex flex-wrap gap-2">
                    {technologyFingerprints.slice(0, 14).map((item) => (
                      <span key={`${item.name}-${item.version || ""}`} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-zinc-300">
                        {item.name}{item.version ? ` ${item.version}` : ""}
                      </span>
                    ))}
                    {technologyFingerprints.length === 0 && <p className="text-sm text-zinc-500">No extra technology fingerprints observed beyond primary HTTP probes.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {schemas.length > 0 && (
            <div className="mt-4 space-y-3">
              {schemas.map((schema) => (
                <div key={schema.url} className="rounded-sm border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">OpenAPI schema</p>
                      <h3 className="mt-1 truncate text-base font-semibold text-zinc-100">{schema.title}</h3>
                      <p className="mt-1 truncate font-mono text-xs text-zinc-500">{schema.url}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white/8 px-2.5 py-1 text-zinc-300">{schema.operation_count} ops</span>
                      <span className="rounded-full bg-white/8 px-2.5 py-1 text-zinc-300">{schema.path_count} paths</span>
                      {schema.schema_version && <span className="rounded-full bg-white/8 px-2.5 py-1 text-zinc-300">v{schema.schema_version}</span>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {schema.methods.map((method) => (
                      <span key={method} className="rounded bg-black/25 px-2 py-1 font-mono text-xs text-emerald-100">{method}</span>
                    ))}
                    {schema.auth_schemes.map((scheme) => (
                      <span key={scheme} className="rounded bg-sky-300/[0.08] px-2 py-1 font-mono text-xs text-sky-100">{scheme}</span>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {schema.sample_operations.slice(0, 6).map((operation) => (
                      <div key={`${operation.method}-${operation.path}`} className="rounded border border-white/8 bg-black/15 px-2 py-1.5">
                        <p className="truncate font-mono text-xs text-zinc-300">
                          <span className="text-emerald-200">{operation.method}</span> {operation.path}
                        </p>
                        {(operation.summary || operation.operation_id) && (
                          <p className="mt-1 truncate text-xs text-zinc-500">{operation.summary || operation.operation_id}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {apiRoutes.length === 0 && apiDocs.length === 0 && parameterizedRoutes.length === 0 && schemas.length === 0 ? (
            <div className="mt-4 rounded-sm border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">
              No obvious API routes or exposed API documentation were observed in the crawl. This does not prove none exist; authenticated or hidden APIs may require a schema, token, or deeper fuzzing stage.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <div className="rounded-sm border border-white/8 bg-black/15 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Candidate API routes</p>
                <div className="space-y-2">
                  {apiRoutes.slice(0, 8).map((route) => (
                    <p key={`${route.path}-${route.url}`} className="truncate rounded bg-white/[0.04] px-2 py-1.5 font-mono text-xs text-zinc-300">
                      {route.path}
                    </p>
                  ))}
                  {apiRoutes.length === 0 && <p className="text-sm text-zinc-500">No API-like routes retained.</p>}
                </div>
              </div>
              <div className="rounded-sm border border-white/8 bg-black/15 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Documentation/schema signals</p>
                <div className="space-y-2">
                  {apiDocs.slice(0, 8).map((route) => (
                    <p key={`${route.path}-${route.url}`} className="truncate rounded bg-emerald-300/[0.07] px-2 py-1.5 font-mono text-xs text-emerald-100">
                      {route.path}
                    </p>
                  ))}
                  {apiDocs.length === 0 && <p className="text-sm text-zinc-500">No Swagger, OpenAPI, Redoc, or GraphQL documentation signal retained.</p>}
                </div>
              </div>
              <div className="rounded-sm border border-white/8 bg-black/15 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Parameter signals</p>
                <div className="space-y-2">
                  {parameterizedRoutes.slice(0, 8).map((route) => (
                    <div key={route.url} className="rounded bg-sky-300/[0.06] px-2 py-1.5">
                      <p className="truncate font-mono text-xs text-sky-100">{route.url}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {route.parameters.slice(0, 6).join(", ")}
                        {route.parameter_count > 6 ? ` +${route.parameter_count - 6} more` : ""}
                      </p>
                    </div>
                  ))}
                  {parameterizedRoutes.length === 0 && <p className="text-sm text-zinc-500">No hidden parameter names retained.</p>}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="report-card report-assurance rounded-[10px] border border-sky-300/15 bg-sky-300/[0.04] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Assurance scope</p>
              <h2 className="mt-2 text-lg font-semibold text-zinc-50">Unauthenticated external audit</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                This report is designed for trustworthy triage: it shows evidence the scanner could observe and avoids claiming complete security where authenticated or business-logic testing is still required.
              </p>
            </div>
            <div className="rounded-sm border border-white/8 bg-black/20 px-3 py-2 font-mono text-xs text-sky-100">
              {assurance?.mode || "unauthenticated_external_scan"}
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {(assurance?.coverage_notes || [
              "Reachable assets only.",
              "Auth and tenant logic need approved credentials.",
              "Retained findings require strong scanner evidence.",
            ]).map((note) => (
              <div key={note} className="rounded-sm border border-white/8 bg-black/15 p-3 text-sm leading-6 text-zinc-400">
                {note}
              </div>
            ))}
          </div>
        </section>

        <section className="report-card rounded-[10px] border border-white/8 bg-white/[0.035] p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-50">Detailed findings</h2>
              <p className="mt-1 text-sm text-zinc-500">Evidence, remediation steps, and coding-agent prompts.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sortedFindings.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyAllFixPrompts}
                  className="inline-flex h-9 items-center gap-2 rounded-sm border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.07]"
                >
                  {copiedAllPrompts ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedAllPrompts ? "Copied all" : "Copy all prompts"}
                </button>
              )}
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-zinc-400">
                {sortedFindings.length} items
              </span>
            </div>
          </div>

          {sortedFindings.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-sm border border-dashed border-white/10 bg-white/[0.02] text-center">
              <CheckCircle2 className="mb-3 h-9 w-9 text-emerald-300" />
              <p className="font-medium text-zinc-200">No priority findings retained</p>
              <p className="mt-1 text-sm text-zinc-500">Automated checks did not produce evidence strong enough for a retained finding.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedFindings.map((finding: Finding, index) => {
                const severity = severityLabel(finding.severity);
                const open = openFindingId === finding.id;
                return (
                  <article key={finding.id || `${finding.title}-${index}`} className="rounded-sm border border-white/8 bg-white/[0.03]">
                    <button
                      type="button"
                      onClick={() => setOpenFindingId(open ? null : finding.id)}
                      className="flex w-full items-center justify-between gap-4 p-4 text-left"
                    >
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", SEVERITY_STYLES[severity])}>
                            {severity}
                          </span>
                          {finding.category && <span className="text-xs text-zinc-500">{finding.category}</span>}
                        </div>
                        <h3 className="truncate text-base font-semibold text-zinc-100">{finding.title}</h3>
                        {finding.affected && <p className="mt-1 truncate font-mono text-xs text-zinc-500">{finding.affected}</p>}
                      </div>
                      <ChevronDown className={cn("h-5 w-5 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} />
                    </button>

                    {open && (
                      <div className="border-t border-white/8 p-4 pt-0">
                        {finding.evidence && (
                          <div className="mt-4 rounded-sm border border-white/8 bg-black/20 p-3">
                            <p className="mb-1 text-xs font-semibold text-zinc-500">Evidence</p>
                            <p className="text-sm text-zinc-300">{finding.evidence}</p>
                          </div>
                        )}
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-semibold text-zinc-500">What it means</p>
                            <p className="text-sm leading-6 text-zinc-300">{finding.what_it_means}</p>
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-semibold text-zinc-500">How to fix</p>
                            <ol className="space-y-2">
                              {finding.how_to_fix.map((step, stepIndex) => (
                                <li key={stepIndex} className="flex gap-2 text-sm leading-6 text-zinc-300">
                                  <span className="font-mono text-xs text-emerald-300">{stepIndex + 1}</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                        <div className="mt-5 rounded-sm border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
                          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Agent fix prompt</p>
                              <p className="mt-1 text-sm text-zinc-500">Paste this into the team&apos;s local coding agent to implement and test the fix.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyFixPrompt(finding)}
                              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-sm border border-emerald-300/20 bg-emerald-300/10 px-3 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-300/15"
                            >
                              {copiedFindingId === finding.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              {copiedFindingId === finding.id ? "Copied" : "Copy prompt"}
                            </button>
                          </div>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-sm border border-white/8 bg-black/25 p-3 text-xs leading-5 text-zinc-400">
                            {finding.fix_prompt?.trim() || buildFixPrompt(finding)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="report-card rounded-[10px] border border-white/8 bg-white/[0.035] p-4 text-xs text-zinc-600">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Automated report generated on {new Date(scan.created_at).toLocaleString()}. Results are evidence-based and scoped to reachable unauthenticated checks; use them with manual validation, authenticated testing, and business-logic review for enterprise assurance.
            </p>
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}
