"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listMyScans, type ScanStatusResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScanInput } from "@/components/scan-input";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const styles = {
    complete: "bg-emerald-50 text-emerald-700 border-emerald-100",
    failed: "bg-red-50 text-red-700 border-red-100",
    running: "bg-amber-50 text-amber-700 border-amber-100",
    pending: "bg-slate-50 text-slate-500 border-slate-100",
  };
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
      styles[status as keyof typeof styles] || styles.pending
    )}>
      {status}
    </span>
  );
}

function StatCard({ label, value, icon, colorClass }: { label: string; value: number; icon: React.ReactNode; colorClass: string }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-ink-black/5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-slate-gray uppercase tracking-wider">{label}</span>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colorClass)}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-semibold text-ink-black tracking-tight">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [scans, setScans] = useState<ScanStatusResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (user) {
        try {
          const data = await listMyScans();
          setScans(data);
        } catch (err) {
          console.error("Failed to load scans", err);
        } finally {
          setLoading(false);
        }
      }
    }
    load();
  }, [user]);

  const stats = {
    total: scans.length,
    complete: scans.filter((s) => s.status === "complete").length,
    running: scans.filter((s) => s.status === "running" || s.status === "pending").length,
    failed: scans.filter((s) => s.status === "failed").length,
  };

  if (authLoading || loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-ink-black tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-slate-gray mt-1">
          Welcome back, {user?.name}. Here is your security overview.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Scans"
          value={stats.total}
          colorClass="bg-ink-black/5 text-ink-black"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
        />
        <StatCard
          label="Complete"
          value={stats.complete}
          colorClass="bg-emerald-50 text-emerald-600"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          }
        />
        <StatCard
          label="In Progress"
          value={stats.running}
          colorClass="bg-amber-50 text-amber-600"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          }
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          colorClass="bg-red-50 text-red-600"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          }
        />
      </div>

      {/* Quick Scan */}
      <div className="bg-white rounded-xl p-8 border border-ink-black/5">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-signal-orange/10 text-signal-orange flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v8m-4-4h8" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink-black tracking-tight">New Scan</h2>
            <p className="text-xs text-slate-gray">Enter a target URL to begin automated reconnaissance.</p>
          </div>
        </div>
        <ScanInput />
      </div>

      {/* Recent Scans Table */}
      <div className="bg-white rounded-xl border border-ink-black/5 overflow-hidden">
        <div className="px-6 py-5 border-b border-ink-black/5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-black tracking-tight">Recent Scans</h2>
          <span className="text-xs font-medium text-slate-gray">{scans.length} total</span>
        </div>

        {scans.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 bg-ink-black/5 rounded-full flex items-center justify-center mx-auto mb-4 text-ink-black/20">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-black mb-1">No scans yet</p>
            <p className="text-xs text-slate-gray">Submit a URL above to run your first security scan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-black/5">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-gray uppercase tracking-wider">Target</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-gray uppercase tracking-wider">Date</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-gray uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-gray uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id} className="border-b border-ink-black/5 last:border-0 hover:bg-lifted-cream/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-ink-black truncate max-w-xs">{scan.url}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-gray whitespace-nowrap">
                      {new Date(scan.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={scan.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={scan.status === "complete" ? `/report/${scan.id}` : `/scan/${scan.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-ink-black hover:text-signal-orange transition-colors"
                      >
                        View
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                          <path d="M5 12h14m-7-7l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
