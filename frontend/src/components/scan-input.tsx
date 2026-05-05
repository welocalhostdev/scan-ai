"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createScan } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ScanInput() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a URL to scan.");
      return;
    }

    let scanUrl = trimmed;
    if (!/^https?:\/\//i.test(scanUrl)) {
      scanUrl = `https://${scanUrl}`;
    }

    setLoading(true);
    try {
      const { scan_id } = await createScan(scanUrl);
      router.push(`/scan/${scan_id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto group">
      <div className={cn(
        "relative flex items-center gap-2 p-2 bg-white rounded-pill shadow-[0_4px_32px_rgba(0,0,0,0.06)] border border-ink-black/5",
        "transition-all duration-300 focus-within:shadow-[0_8px_48px_rgba(0,0,0,0.1)] focus-within:-translate-y-1"
      )}>
        <div className="pl-6 flex items-center text-ink-black/30">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <Input
          id="scan-url-input"
          type="text"
          placeholder="Enter a URL to scan..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          className="flex-1 h-14 px-4 text-lg font-medium bg-transparent border-none focus-visible:ring-0 placeholder:text-slate-gray/40"
          disabled={loading}
          aria-label="Target URL"
        />
        <Button
          id="scan-submit-button"
          type="submit"
          size="lg"
          className="rounded-pill px-10 h-14 bg-ink-black text-canvas-cream"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Scanning...
            </span>
          ) : (
            "Scan Now"
          )}
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-semibold text-center animate-fade-in-up">
          {error}
        </div>
      )}
    </form>
  );
}

