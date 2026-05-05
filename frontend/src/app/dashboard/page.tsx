"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listMyScans, type ScanStatusResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

  if (authLoading || loading) {
    return (
      <main className="flex-1 bg-background py-32 px-6">
        <div className="max-w-5xl mx-auto space-y-12">
          <Skeleton className="h-12 w-64 rounded-pill" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-stadium" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-background py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-16">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-pill bg-white border border-ink-black/5 mb-6 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-signal-orange" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">
                Personal Console
              </span>
            </div>
            <h1 className="text-5xl font-medium tracking-tight text-ink-black">
              Welcome back, <br /> <span className="italic font-serif text-slate-gray">{user?.name}</span>
            </h1>
          </div>
          
          <Link href="/" className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <Button variant="default" size="lg" className="rounded-pill px-10">
               Start New Scan
            </Button>
          </Link>
        </div>

        <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-medium text-ink-black">Scan History</h2>
            <span className="text-xs font-bold text-ink-black/30 uppercase tracking-widest">
              {scans.length} Total Sessions
            </span>
          </div>

          {scans.length === 0 ? (
            <div className="bg-white rounded-stadium p-20 text-center border border-ink-black/5 shadow-sm">
               <div className="w-16 h-16 bg-ink-black/5 rounded-full flex items-center justify-center mx-auto mb-6 text-ink-black/20">
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
               </div>
               <h3 className="text-2xl font-medium text-ink-black mb-2">No scans found</h3>
               <p className="text-slate-gray mb-8">Ready to secure your first target?</p>
               <Link href="/">
                 <Button variant="outline">New Scan</Button>
               </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {scans.map((scan) => (
                <Link 
                  key={scan.id} 
                  href={scan.status === 'complete' ? `/report/${scan.id}` : `/scan/${scan.id}`}
                  className="group block"
                >
                  <div className="bg-white rounded-stadium p-6 border border-ink-black/5 shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:-translate-y-1 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6 w-full sm:w-auto">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                        scan.status === 'complete' ? "bg-green-50 text-green-500" : 
                        scan.status === 'failed' ? "bg-red-50 text-red-500" : "bg-ink-black/5 text-ink-black/40"
                      )}>
                        {scan.status === 'complete' ? (
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                        ) : scan.status === 'failed' ? (
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        ) : (
                          <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /></svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-medium text-ink-black truncate">{scan.url}</p>
                        <p className="text-xs text-slate-gray/60 font-medium">{new Date(scan.created_at).toLocaleDateString()} · {new Date(scan.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="text-right hidden sm:block">
                         <span className={cn(
                           "text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-pill",
                           scan.status === 'complete' ? "bg-green-50 text-green-600" : 
                           scan.status === 'failed' ? "bg-red-50 text-red-600" : "bg-ink-black/5 text-ink-black/40"
                         )}>
                           {scan.status}
                         </span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-ink-black/5 flex items-center justify-center text-ink-black group-hover:bg-ink-black group-hover:text-white transition-colors">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12h14m-7-7l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
