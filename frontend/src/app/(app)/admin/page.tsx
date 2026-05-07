"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getAdminStats,
  getAdminUsers,
  getAdminScans,
  deleteAdminUser,
  generateAdminScanPDF,
  getAdminScanPDFDownloadUrl,
  getAdminScanPDFViewUrl,
  getTokenUsageStats,
  type AdminStats,
  type AdminUser,
  type AdminScan,
  type TokenUsageStats,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ScanDetailModalProps {
  scan: AdminScan | null;
  onClose: () => void;
  onGeneratePDF: (scanId: string) => Promise<void>;
  onOpenPDF: (scan: AdminScan, autoDownload?: boolean) => void;
  generatingPDF: string | null;
}

interface PDFPreviewModalProps {
  scan: AdminScan | null;
  autoDownloadToken: number;
  onClose: () => void;
}

function PDFPreviewModal({ scan, autoDownloadToken, onClose }: PDFPreviewModalProps) {
  useEffect(() => {
    if (!scan || !autoDownloadToken) return;

    const link = document.createElement("a");
    link.href = getAdminScanPDFDownloadUrl(scan.id);
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [autoDownloadToken, scan]);

  if (!scan) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 p-4">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
          <div>
            <h2 className="text-lg font-semibold">PDF Preview</h2>
            <p className="text-xs text-zinc-400">{scan.url}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={getAdminScanPDFDownloadUrl(scan.id)}
              className="inline-flex items-center gap-2 rounded-lg bg-signal-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-signal-orange/90"
            >
              Download
            </a>
            <Button variant="outline" onClick={onClose} className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white">
              Close
            </Button>
          </div>
        </div>
        <div className="flex-1 bg-zinc-900">
          <iframe
            title="Scan PDF preview"
            src={getAdminScanPDFViewUrl(scan.id)}
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

function ScanDetailModal({ scan, onClose, onGeneratePDF, onOpenPDF, generatingPDF }: ScanDetailModalProps) {
  if (!scan) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Scan Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Target URL</p>
              <p className="text-sm font-mono break-all">{scan.url}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">User</p>
              <p className="text-sm">{scan.user_name || "Anonymous"}</p>
              <p className="text-xs text-gray-400">{scan.user_email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</p>
              <Badge
                variant="outline"
                className={
                  scan.status === "complete"
                    ? "border-emerald-500 text-emerald-600"
                    : scan.status === "failed"
                      ? "border-red-500 text-red-600"
                      : scan.status === "running"
                        ? "border-amber-500 text-amber-600"
                        : ""
                }
              >
                {scan.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Progress</p>
              <p className="text-sm font-mono">{scan.progress_step}/7</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Created</p>
              <p className="text-sm">{new Date(scan.created_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Scan ID</p>
              <p className="text-xs font-mono">{scan.id}</p>
            </div>
          </div>

          {/* Error Display */}
          {scan.error && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-4">
              <p className="text-xs text-red-500 uppercase tracking-wider mb-2">Error</p>
              <p className="text-sm text-red-700 font-mono whitespace-pre-wrap">{scan.error}</p>
            </div>
          )}

          {/* Report Summary */}
          {scan.report && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Report Summary</p>
              <p className="text-sm text-gray-700 mb-3">{scan.report.summary}</p>
              {scan.report.risk_score !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Risk Score:</span>
                  <span className={`font-semibold ${
                    scan.report.risk_score >= 80 ? "text-red-600" :
                    scan.report.risk_score >= 60 ? "text-orange-600" :
                    scan.report.risk_score >= 40 ? "text-amber-600" :
                    scan.report.risk_score >= 20 ? "text-blue-600" : "text-emerald-600"
                  }`}>
                    {scan.report.risk_score}/100
                  </span>
                </div>
              )}
              {scan.report.findings && (
                <p className="text-xs text-gray-500 mt-2">
                  {scan.report.findings.length} finding(s) detected
                </p>
              )}
            </div>
          )}

          {/* PDF Actions */}
          <div className="flex items-center gap-3 pt-2">
            {scan.pdf_url ? (
              <>
                <Button
                  onClick={() => onOpenPDF(scan)}
                  className="inline-flex items-center gap-2"
                >
                  View PDF
                </Button>
                <a
                  href={getAdminScanPDFDownloadUrl(scan.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Download PDF
                </a>
              </>
            ) : scan.status === "complete" ? (
              <Button
                onClick={() => onGeneratePDF(scan.id)}
                disabled={generatingPDF === scan.id}
                className="inline-flex items-center gap-2"
              >
                {generatingPDF === scan.id ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate PDF
                  </>
                )}
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [scans, setScans] = useState<AdminScan[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "scans" | "tokens">("users");
  const [selectedScan, setSelectedScan] = useState<AdminScan | null>(null);
  const [previewScan, setPreviewScan] = useState<AdminScan | null>(null);
  const [previewAutoDownloadToken, setPreviewAutoDownloadToken] = useState(0);
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, u, sc, t] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdminScans(),
        getTokenUsageStats(),
      ]);
      setStats(s);
      setUsers(u);
      setScans(sc);
      setTokenStats(t);
    } catch {
      // Will redirect below
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) {
      router.push("/");
      return;
    }
    let cancelled = false;

    const run = async () => {
      await loadData();
      if (cancelled) return;
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isAdmin, router, loadData]);

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This will also delete their scans.`)) return;
    try {
      await deleteAdminUser(userId);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const handleGeneratePDF = async (scanId: string) => {
    setGeneratingPDF(scanId);
    try {
      const result = await generateAdminScanPDF(scanId);
      const existingScan =
        (selectedScan && selectedScan.id === scanId ? selectedScan : null) ||
        scans.find((scan) => scan.id === scanId) ||
        null;
      const updatedScan = existingScan ? { ...existingScan, pdf_url: result.pdf_url } : null;

      setScans((prev) =>
        prev.map((scan) =>
          scan.id === scanId ? { ...scan, pdf_url: result.pdf_url } : scan
        )
      );
      setSelectedScan((prev) =>
        prev && prev.id === scanId ? { ...prev, pdf_url: result.pdf_url } : prev
      );

      if (updatedScan) {
        setPreviewScan(updatedScan);
        setPreviewAutoDownloadToken(Date.now());
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to generate PDF.");
    } finally {
      setGeneratingPDF(null);
    }
  };

  const handleOpenPDF = (scan: AdminScan, autoDownload = false) => {
    setPreviewScan(scan);
    setPreviewAutoDownloadToken(autoDownload ? Date.now() : 0);
  };

  if (authLoading || loading) {
    return (
      <main className="flex-1 max-w-6xl mx-auto px-6 py-12">
        <Skeleton className="h-10 w-48 mb-8" />
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="flex-1 relative">
      <div className="absolute inset-0 bg-linear-to-br from-background via-background to-primary/3 pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage users and monitor all scans across the platform.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <Card className="glass-card">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Users</p>
                <p className="text-3xl font-bold">{stats.total_users}</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Scans</p>
                <p className="text-3xl font-bold">{stats.total_scans}</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Active Scans</p>
                <p className="text-3xl font-bold text-primary">{stats.active_scans}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Token Usage Tab */}
        {tab === "tokens" && tokenStats && (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card">
                <CardContent className="p-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Tokens</p>
                  <p className="text-2xl font-bold">{tokenStats.total_tokens_all_time.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">AI Reports Generated</p>
                  <p className="text-2xl font-bold">{tokenStats.total_scans.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Estimated Cost</p>
                  <p className="text-2xl font-bold">{tokenStats.total_cost_estimate}</p>
                </CardContent>
              </Card>
            </div>

            {/* Usage by User */}
            {tokenStats.by_user.length > 0 && (
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 border-b border-border/50">
                    <h3 className="font-medium">Usage by User</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                          <th className="text-left p-4 font-medium text-muted-foreground">User</th>
                          <th className="text-left p-4 font-medium text-muted-foreground">Scans</th>
                          <th className="text-right p-4 font-medium text-muted-foreground">Total Tokens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenStats.by_user.map((u) => (
                          <tr key={u.user_id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="p-4">{u.user_email}</td>
                            <td className="p-4 font-mono">{u.scan_count}</td>
                            <td className="p-4 text-right font-mono">{u.total_tokens.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Usage by Model */}
            {tokenStats.by_model.length > 0 && (
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 border-b border-border/50">
                    <h3 className="font-medium">Usage by Model</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                          <th className="text-left p-4 font-medium text-muted-foreground">Model</th>
                          <th className="text-left p-4 font-medium text-muted-foreground">Scans</th>
                          <th className="text-right p-4 font-medium text-muted-foreground">Total Tokens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenStats.by_model.map((m) => (
                          <tr key={m.model} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="p-4 font-mono">{m.model}</td>
                            <td className="p-4 font-mono">{m.scan_count}</td>
                            <td className="p-4 text-right font-mono">{m.total_tokens.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Usage */}
            {tokenStats.recent_usage.length > 0 && (
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 border-b border-border/50">
                    <h3 className="font-medium">Recent Usage</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                          <th className="text-left p-4 font-medium text-muted-foreground">Scan ID</th>
                          <th className="text-left p-4 font-medium text-muted-foreground">User</th>
                          <th className="text-left p-4 font-medium text-muted-foreground">Model</th>
                          <th className="text-right p-4 font-medium text-muted-foreground">Tokens</th>
                          <th className="text-right p-4 font-medium text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenStats.recent_usage.map((t) => (
                          <tr key={t.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="p-4 font-mono text-xs">{t.scan_id.slice(0, 8)}...</td>
                            <td className="p-4 text-xs">{t.user_email || "Anonymous"}</td>
                            <td className="p-4 font-mono text-xs">{t.model || "unknown"}</td>
                            <td className="p-4 text-right font-mono">{t.total_tokens.toLocaleString()}</td>
                            <td className="p-4 text-right text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Tab buttons */}
        <div className="flex gap-2 mb-6">
          <Button
            id="admin-tab-users"
            variant={tab === "users" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("users")}
            className="cursor-pointer"
          >
            Users ({users.length})
          </Button>
          <Button
            id="admin-tab-scans"
            variant={tab === "scans" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("scans")}
            className="cursor-pointer"
          >
            All Scans ({scans.length})
          </Button>
          <Button
            id="admin-tab-tokens"
            variant={tab === "tokens" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("tokens")}
            className="cursor-pointer"
          >
            Token Usage
          </Button>
        </div>

        {/* Users table */}
        {tab === "users" && (
          <Card className="glass-card overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-4 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Email</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Role</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Scans</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Joined</th>
                      <th className="text-right p-4 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="p-4 font-medium">{u.name}</td>
                        <td className="p-4 text-muted-foreground">{u.email}</td>
                        <td className="p-4">
                          <Badge
                            variant={u.role === "admin" ? "default" : "outline"}
                            className="text-xs"
                          >
                            {u.role}
                          </Badge>
                        </td>
                        <td className="p-4 font-mono">{u.scan_count}</td>
                        <td className="p-4 text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right">
                          {u.id !== user?.id && (
                            <Button
                              id={`delete-user-${u.id}`}
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs cursor-pointer"
                              onClick={() => handleDeleteUser(u.id, u.email)}
                            >
                              Delete
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scans table */}
        {tab === "scans" && (
          <Card className="glass-card overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-4 font-medium text-muted-foreground">URL</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">User</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Step</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">PDF</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((s) => (
                      <tr 
                        key={s.id} 
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedScan(s)}
                      >
                        <td className="p-4 font-mono text-xs max-w-62.5 truncate">{s.url}</td>
                        <td className="p-4 text-muted-foreground">{s.user_name || "—"}</td>
                        <td className="p-4">
                          <Badge
                            variant="outline"
                            className={
                              s.status === "complete"
                                ? "border-emerald-500 text-emerald-600"
                                : s.status === "failed"
                                  ? "border-red-500 text-red-600"
                                  : s.status === "running"
                                    ? "border-amber-500 text-amber-600"
                                    : ""
                            }
                          >
                            {s.status}
                          </Badge>
                        </td>
                        <td className="p-4 font-mono">{s.progress_step}/7</td>
                        <td className="p-4">
                          {s.pdf_url ? (
                            <span className="inline-flex items-center text-emerald-600 text-xs">
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Ready
                            </span>
                          ) : s.status === "complete" ? (
                            <span className="text-xs text-gray-400">Click to generate</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Scan Detail Modal */}
      <ScanDetailModal
        scan={selectedScan}
        onClose={() => setSelectedScan(null)}
        onGeneratePDF={handleGeneratePDF}
        onOpenPDF={handleOpenPDF}
        generatingPDF={generatingPDF}
      />

      <PDFPreviewModal
        scan={previewScan}
        autoDownloadToken={previewAutoDownloadToken}
        onClose={() => {
          setPreviewScan(null);
          setPreviewAutoDownloadToken(0);
        }}
      />
    </main>
  );
}
