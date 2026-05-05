"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getScan, type ScanStatusResponse } from "@/lib/api";
import { StepIndicator } from "@/components/step-indicator";
import { Button } from "@/components/ui/button";

export default function ScanProgressPage() {
  const router = useRouter();
  const params = useParams();
  const scanId = params.id as string;
  const initialFetchRef = useRef(false);

  const [scan, setScan] = useState<ScanStatusResponse | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getScan(scanId);
      setScan(data);

      if (data.status === "complete") {
        setTimeout(() => {
          router.push(`/report/${scanId}`);
        }, 1500);
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

  const isFailed = scan?.status === "failed";
  const currentStep = scan?.progress_step ?? 0;

  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Ghost Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[15vw] font-bold text-ink-black opacity-[0.02] select-none pointer-events-none whitespace-nowrap">
        SCANNING
      </div>

      <div className="relative z-10 w-full max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="mb-12 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-pill bg-white border border-ink-black/5 mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-signal-orange animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">
              {isFailed ? "Analysis Halted" : "Security Analysis in Progress"}
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-ink-black leading-tight mb-4">
            {isFailed ? "Process Interrupted" : "Deconstructing Target"}
          </h1>
          
          {scan && (
            <p className="text-sm font-mono text-slate-gray bg-white/50 px-4 py-1 rounded-pill border border-ink-black/5 inline-block">
              {scan.url}
            </p>
          )}
        </div>

        {/* Step Indicator Container */}
        <div className="bg-white rounded-stadium p-12 mb-12 shadow-[0_8px_48px_rgba(0,0,0,0.04)] border border-ink-black/5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <StepIndicator currentStep={currentStep} failed={isFailed} />
        </div>

        {/* Error / Footer */}
        <div className="min-h-[80px]">
          {isFailed ? (
            <div className="space-y-6 animate-fade-in-up">
              {scan?.error && (
                <p className="text-sm text-destructive font-medium bg-destructive/5 rounded-xl p-4 border border-destructive/10 max-w-lg mx-auto">
                  {scan.error}
                </p>
              )}
              <div className="flex items-center justify-center gap-4">
                <Button variant="default" onClick={() => router.push("/")}>Retry Scan</Button>
                <Button variant="outline" onClick={() => router.push("/")}>Exit to Home</Button>
              </div>
            </div>
          ) : (
             <p className="text-sm text-slate-gray/60 font-medium animate-pulse">
               Intelligence gathering usually takes 3-5 minutes...
             </p>
          )}
        </div>
      </div>
    </main>
  );
}

