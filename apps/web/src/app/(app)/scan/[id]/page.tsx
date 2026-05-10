"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AlertTriangle, Ban, CheckCircle2, Clock3, Loader2, Radar, XCircle } from "lucide-react";
import { cancelScan, getScan, type ScanStatusResponse, type SubTaskStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const TASK_LABELS: Record<string, string> = {
  subfinder: "Subdomain discovery",
  dnsx: "DNS validation",
  httpx: "Live host probing",
  naabu: "Port scanning",
  katana: "Endpoint crawling",
  ffuf_api: "Hidden API route discovery",
  openapi: "OpenAPI schema discovery",
  nuclei: "Vulnerability checks",
  nuclei_api: "API exposure checks",
  arjun: "Parameter discovery",
  testssl: "TLS and header analysis",
  tlsx: "Certificate inventory",
  dalfox: "XSS validation",
  ai: "AI report generation",
};

const STATUS_ICON: Record<SubTaskStatus, React.ElementType> = {
  pending: Clock3,
  running: Loader2,
  complete: CheckCircle2,
  failed: XCircle,
};

export default function ScanProgressPage() {
  const router = useRouter();
  const params = useParams();
  const scanId = params.id as string;
  const initialFetchRef = useRef(false);

  const [scan, setScan] = useState<ScanStatusResponse | null>(null);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getScan(scanId);
      setScan(data);

      if (data.status === "complete") {
        router.replace(`/report/${scanId}`);
      }
    } catch (err: unknown) {
      console.error("Failed to fetch scan status:", err);
    }
  }, [scanId, router]);

  useEffect(() => {
    if (!initialFetchRef.current) {
      fetchStatus();
      initialFetchRef.current = true;
    }

    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStop = async () => {
    setStopping(true);
    setStopError(null);
    try {
      await cancelScan(scanId);
      await fetchStatus();
    } catch (err: unknown) {
      console.error("Failed to stop scan:", err);
      setStopError(err instanceof Error ? err.message : "Failed to stop scan.");
    } finally {
      setStopping(false);
    }
  };

  const isFailed = scan?.status === "failed";
  const isActive = scan?.status === "running" || scan?.status === "pending";
  const taskEntries = Object.entries(scan?.sub_tasks || {}) as Array<[string, SubTaskStatus]>;
  const completeCount = taskEntries.filter(([, status]) => status === "complete").length;
  const progress = taskEntries.length > 0 ? Math.round((completeCount / taskEntries.length) * 100) : Math.min((scan?.progress_step || 0) * 14, 100);

  return (
    <div className="mesh-grain-canvas min-h-full bg-[radial-gradient(circle_at_18%_0%,rgba(79,165,182,0.13),transparent_32%),radial-gradient(circle_at_84%_4%,rgba(239,90,42,0.1),transparent_30%),#070808] p-4 text-zinc-100 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-116px)] w-full max-w-[1780px]">
        <div className="animate-drawer-slide-in flex w-full flex-col justify-center rounded-[34px] border border-white/10 bg-[#101415]/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
          {isFailed ? <AlertTriangle className="h-3.5 w-3.5 text-red-300" /> : <Radar className="h-3.5 w-3.5" />}
          {isFailed ? "Scan stopped or failed" : "Security scan running"}
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.86fr_1.14fr]">
          <section className="rounded-[28px] border border-white/8 bg-white/[0.035] p-6">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
              {isFailed ? "Scan interrupted" : "Analyzing target"}
            </h1>
            <p className="mt-3 break-all font-mono text-sm text-zinc-500">{scan?.url || "Loading target..."}</p>

            <div className="mt-8">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Pipeline progress</span>
                <span className="font-mono text-zinc-200">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div className={cn("h-full rounded-full", isFailed ? "bg-red-300" : "bg-emerald-300")} style={{ width: `${progress}%` }} />
              </div>
            </div>

            {(scan?.error || stopError) && (
              <div className="mt-6 rounded-md border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100">
                {stopError || scan?.error}
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              {isActive && (
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={stopping}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-red-300 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Ban className="h-4 w-4" />
                  {stopping ? "Stopping..." : "Stop scan"}
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="inline-flex h-10 items-center rounded-md border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.07]"
              >
                Back to dashboard
              </button>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/8 bg-white/[0.035] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-50">Task pipeline</h2>
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-zinc-400">
                {scan?.status || "loading"}
              </span>
            </div>

            <div className="space-y-2">
              {(taskEntries.length > 0 ? taskEntries : Object.keys(TASK_LABELS).map((key) => [key, "pending"] as [string, SubTaskStatus])).map(([key, status]) => {
                const Icon = STATUS_ICON[status];
                return (
                  <div key={key} className="flex items-center justify-between rounded-md border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon className={cn(
                        "h-4 w-4",
                        status === "running" && "animate-spin text-amber-200",
                        status === "complete" && "text-emerald-300",
                        status === "failed" && "text-red-300",
                        status === "pending" && "text-zinc-600"
                      )} />
                      <span className="text-sm font-medium text-zinc-300">{TASK_LABELS[key] || key}</span>
                    </div>
                    <span className="font-mono text-xs text-zinc-500">{status}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        </div>
      </div>
    </div>
  );
}
