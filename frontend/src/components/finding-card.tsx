"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SeverityBadge } from "@/components/severity-badge";
import type { Finding } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FindingCardProps {
  finding: Finding;
  index: number;
}

export function FindingCard({ finding, index }: FindingCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="animate-fade-in-up opacity-0"
      style={{ animationDelay: `${index * 0.08}s`, animationFillMode: "forwards" }}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card
          className={cn(
            "bg-white rounded-stadium border border-ink-black/5 shadow-sm transition-all duration-300 overflow-hidden",
            "hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] hover:-translate-y-1",
            open && "shadow-md ring-1 ring-ink-black/5"
          )}
        >
          <CollapsibleTrigger
            id={`finding-${finding.id}`}
            className="w-full text-left p-8 cursor-pointer bg-transparent border-none group"
          >
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-3">
                  <SeverityBadge severity={finding.severity as "critical" | "high" | "medium" | "low" | "info"} />
                  <h3 className="font-medium text-lg tracking-tight text-ink-black truncate">
                    {finding.title}
                  </h3>
                </div>
                {finding.affected && (
                  <p className="text-xs font-mono text-slate-gray/60 bg-ink-black/5 px-2 py-1 rounded-pill inline-block max-w-full">
                    <span className="truncate block" title={finding.affected}>
                      {finding.affected.length > 60 
                        ? `${finding.affected.slice(0, 60)}... (${finding.affected.split(',').length} items)`
                        : finding.affected}
                    </span>
                  </p>
                )}
              </div>

              <div className={cn(
                "w-10 h-10 rounded-full bg-ink-black/5 flex items-center justify-center transition-all duration-300",
                open ? "bg-ink-black text-white rotate-180" : "group-hover:bg-ink-black/10"
              )}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="px-8 pb-10 pt-0 space-y-10">
              <div className="h-px bg-ink-black/5" />

              {/* What it means */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-1 h-1 rounded-full bg-signal-orange" />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-black/40">
                    Security Analysis
                  </h4>
                </div>
                <p className="text-base leading-relaxed text-slate-gray italic font-serif break-words">
                  {finding.what_it_means}
                </p>
              </div>

              {/* How to fix */}
              <div className="bg-lifted-cream rounded-stadium p-8 border border-ink-black/5">
                <div className="flex items-center gap-2 mb-6">
                  <span className="w-1 h-1 rounded-full bg-signal-orange" />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-black/40">
                    Remediation Steps
                  </h4>
                </div>
                <ol className="space-y-4">
                  {finding.how_to_fix.map((step, i) => (
                    <li key={i} className="flex gap-4 text-sm leading-relaxed text-ink-black font-medium">
                      <span className="w-6 h-6 rounded-full bg-white border border-ink-black/10 text-ink-black text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="break-words">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

