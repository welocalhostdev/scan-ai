"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getAdminStats,
  getAdminUsers,
  getAdminScans,
  deleteAdminUser,
  type AdminStats,
  type AdminUser,
  type AdminScan,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [scans, setScans] = useState<AdminScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "scans">("users");

  const loadData = useCallback(async () => {
    try {
      const [s, u, sc] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdminScans(),
      ]);
      setStats(s);
      setUsers(u);
      setScans(sc);
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
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/3 pointer-events-none" />

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
                      <th className="text-left p-4 font-medium text-muted-foreground">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((s) => (
                      <tr key={s.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="p-4 font-mono text-xs max-w-[250px] truncate">{s.url}</td>
                        <td className="p-4 text-muted-foreground">{s.user_name || "—"}</td>
                        <td className="p-4">
                          <Badge
                            variant="outline"
                            className={
                              s.status === "complete"
                                ? "border-scan-success/30 text-scan-success"
                                : s.status === "failed"
                                  ? "border-destructive/30 text-destructive"
                                  : s.status === "running"
                                    ? "border-primary/30 text-primary"
                                    : ""
                            }
                          >
                            {s.status}
                          </Badge>
                        </td>
                        <td className="p-4 font-mono">{s.progress_step}/7</td>
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
    </main>
  );
}
