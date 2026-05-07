"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  generateScanPDF,
  getScan,
  getScanPDFDownloadUrl,
  getScanPDFViewUrl,
  type ScanStatusResponse,
  type Finding,
} from "@/lib/api";
import { FindingCard } from "@/components/finding-card";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

function RiskScoreGauge({ score }: { score: number }) {
  const circumference = 283; 
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80 ? "#EB001B" : score >= 60 ? "#CF4500" : score >= 40 ? "#F79E1B" : score >= 20 ? "#3860BE" : "#141413";

  const label =
    score >= 80 ? "Critical Risk" : score >= 60 ? "High Risk" : score >= 40 ? "Medium Risk" : score >= 20 ? "Low Risk" : "Minimal Risk";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-48 h-48">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(20,20,19,0.05)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r="45" fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
            style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-medium tracking-tighter" style={{ color }}>{score}</span>
          <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black/30 uppercase">Score</span>
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-1 rounded-pill border border-ink-black/5 bg-white shadow-sm">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-bold tracking-widest uppercase text-ink-black">{label}</span>
      </div>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const scanId = params.id as string;

  const [scan, setScan] = useState<ScanStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

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

  const severityCounts = useMemo(() => {
    if (!scan?.report?.findings) return {} as Record<Severity, number>;
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    scan.report.findings.forEach((f: Finding) => {
      if (f.severity in counts) counts[f.severity as Severity]++;
    });
    return counts;
  }, [scan]);

  const sortedFindings = useMemo(() => {
    if (!scan?.report?.findings) return [];
    return [...scan.report.findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity as Severity) - SEVERITY_ORDER.indexOf(b.severity as Severity)
    );
  }, [scan]);

  if (loading) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-background">
        <div className="w-full max-w-4xl mx-auto px-6 py-16 space-y-12">
          <Skeleton className="h-10 w-64 mx-auto rounded-pill" />
          <Skeleton className="h-48 w-48 mx-auto rounded-full" />
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-stadium" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error || !scan?.report) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center bg-background">
        <div className="text-center space-y-6">
          <p className="text-destructive font-medium">{error || "Report not available."}</p>
          <Button variant="outline" onClick={() => router.push("/")}>Back to Home</Button>
        </div>
      </main>
    );
  }

  const report = scan.report;

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

  return (
    <main className="flex-1 bg-background relative selection:bg-light-signal-orange selection:text-white">
      <section className="print-report">
        <header>
          <p className="print-kicker">Official Security Report</p>
          <h1>ScanAI Security Report</h1>
          <p className="print-url">{scan.url}</p>
          <p className="print-date">Scanned on {new Date(scan.created_at).toLocaleString()}</p>
        </header>

        <section className="print-summary">
          <div>
            <p className="print-label">Risk Score</p>
            <p className="print-score">{report.risk_score}/100</p>
          </div>
          <div>
            <p className="print-label">Summary</p>
            <p>{report.summary}</p>
          </div>
        </section>

        {report.priority_actions && report.priority_actions.length > 0 && (
          <section>
            <h2>Priority Actions</h2>
            <ol>
              {report.priority_actions.map((action, index) => (
                <li key={`${action}-${index}`}>{action}</li>
              ))}
            </ol>
          </section>
        )}

        <section>
          <h2>Detailed Findings</h2>
          {sortedFindings.length === 0 ? (
            <p>No vulnerabilities were detected in this scan.</p>
          ) : (
            sortedFindings.map((finding, index) => (
              <article key={finding.id} className="print-finding">
                <div className="print-finding-head">
                  <h3>{index + 1}. {finding.title}</h3>
                  <span>{finding.severity}</span>
                </div>
                {finding.affected && (
                  <p><strong>Affected:</strong> {finding.affected}</p>
                )}
                {finding.evidence && (
                  <p><strong>Evidence:</strong> {finding.evidence}</p>
                )}
                <p><strong>What it means:</strong> {finding.what_it_means}</p>
                <div>
                  <strong>How to fix:</strong>
                  <ol>
                    {finding.how_to_fix.map((step, stepIndex) => (
                      <li key={stepIndex}>{step}</li>
                    ))}
                  </ol>
                </div>
              </article>
            ))
          )}
        </section>
      </section>

      <section className="screen-report">
      {/* Editorial Header */}
      <div className="pt-8 pb-16 px-6 max-w-7xl mx-auto w-full border-b border-ink-black/5">
        <div className="flex flex-col md:flex-row justify-between items-end gap-8">
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-signal-orange" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">Official Security Report</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-ink-black mb-4">
              Intelligence Summary
            </h1>
            <p className="text-lg font-mono text-slate-gray">{scan.url}</p>
          </div>
          
          <div className="flex items-center gap-3 no-print animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {scan.pdf_url ? (
              <a
                href={getScanPDFDownloadUrl(scanId)}
                className="inline-flex items-center gap-2 rounded-pill border border-ink-black/10 bg-white px-6 py-2 text-sm font-medium text-ink-black transition-colors hover:bg-ink-black/5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Download Memo PDF
              </a>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGeneratePdf}
                disabled={generatingPdf}
                className="rounded-pill px-6"
              >
                <svg className={`w-4 h-4 mr-2 ${generatingPdf ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  {generatingPdf ? (
                    <path d="M12 2a10 10 0 1 0 10 10" />
                  ) : (
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
                  )}
                </svg>
                {generatingPdf ? "Generating PDF..." : "Generate Memo PDF"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-pill px-6">
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Print Report
            </Button>
            <Button variant="default" size="sm" onClick={() => router.push("/")} className="rounded-pill px-6">
              New Scan
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Sidebar - Risk Gauge */}
          <div className="lg:col-span-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="sticky top-32 bg-white rounded-stadium p-12 border border-ink-black/5 shadow-[0_4px_32px_rgba(0,0,0,0.04)] text-center">
              <RiskScoreGauge score={report.risk_score} />
              <div className="mt-12 space-y-4">
                <div className="pt-8 border-t border-ink-black/5">
                  <p className="text-[10px] font-bold tracking-widest text-ink-black/30 uppercase mb-4 text-left px-2">Findings Breakdown</p>
                  <div className="flex flex-wrap gap-2">
                    {SEVERITY_ORDER.filter((s) => s !== "info").map((severity) => (
                      <SeverityBadge
                        key={severity}
                        severity={severity}
                        count={severityCounts[severity] || 0}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content - Findings */}
          <div className="lg:col-span-8 space-y-12 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <div className="prose prose-slate max-w-none">
              <p className="text-xl leading-relaxed text-slate-gray mb-12 italic font-serif">
                &quot;{report.summary}&quot;
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-medium text-ink-black">Detailed Findings</h2>
                <span className="text-sm font-bold text-ink-black/30 bg-ink-black/5 px-3 py-1 rounded-pill">
                  {sortedFindings.length} Items Detected
                </span>
              </div>

              {sortedFindings.length === 0 ? (
                <div className="bg-white rounded-stadium p-16 text-center border border-ink-black/5 shadow-sm">
                   <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 text-green-500">
                      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                   </div>
                   <h3 className="text-2xl font-medium text-ink-black mb-2">No Vulnerabilities Detected</h3>
                   <p className="text-slate-gray">Your target appears secure across all scanned vectors.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {sortedFindings.map((finding, index) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Report Footer */}
      <footer className="py-20 border-t border-ink-black/5 text-center no-print">
         <p className="text-[10px] font-bold tracking-[0.2em] text-ink-black/20 uppercase max-w-2xl mx-auto">
           This report is an automated assessment of publicly reachable assets. It should be used as a guideline for further manual security validation.
         </p>
         <p className="mt-8 text-xs text-ink-black/40">
           Scanned on {new Date(scan.created_at).toLocaleString()}
         </p>
      </footer>
      </section>
    </main>
  );
}
