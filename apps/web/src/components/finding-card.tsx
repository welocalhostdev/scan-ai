"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
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

function buildFixPrompt(finding: Finding) {
  const remediation = finding.how_to_fix.map((step) => `- ${step}`).join("\n");

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
    remediation || "- Implement the safest fix that removes the vulnerable behavior.",
    "",
    "Acceptance criteria:",
    "- Identify the exact route, handler, middleware, config, or dependency responsible.",
    "- Implement the smallest durable fix.",
    "- Add or update tests that would have failed before the fix.",
    "- Run the relevant lint/test/build commands and summarize the changed files.",
  ].join("\n");
}

export function FindingCard({ finding, index }: FindingCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyFixPrompt() {
    await navigator.clipboard.writeText(finding.fix_prompt?.trim() || buildFixPrompt(finding));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className="animate-fade-in-up opacity-0"
      style={{ animationDelay: `${index * 0.08}s`, animationFillMode: "forwards" }}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card
          className={cn(
            "overflow-hidden rounded-lg border border-white/8 bg-white/[0.03] text-zinc-100 shadow-none transition-all duration-300",
            "hover:border-white/14 hover:bg-white/[0.05]",
            open && "border-emerald-300/20 bg-emerald-300/[0.035]"
          )}
        >
          <CollapsibleTrigger
            id={`finding-${finding.id}`}
            className="group w-full cursor-pointer border-none bg-transparent p-5 text-left"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <SeverityBadge severity={finding.severity as "critical" | "high" | "medium" | "low" | "info"} />
                  {finding.category && <span className="text-xs text-zinc-500">{finding.category}</span>}
                  <h3 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-zinc-100">
                    {finding.title}
                  </h3>
                </div>
                {finding.affected && (
                  <p className="inline-block max-w-full rounded-md bg-black/25 px-2 py-1 font-mono text-xs text-zinc-500">
                    <span className="truncate block" title={finding.affected}>
                      {finding.affected.length > 60 
                        ? `${finding.affected.slice(0, 60)}... (${finding.affected.split(',').length} items)`
                        : finding.affected}
                    </span>
                  </p>
                )}
              </div>

              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.05] text-zinc-500 transition-all duration-300",
                open ? "rotate-180 bg-emerald-300/10 text-emerald-100" : "group-hover:bg-white/[0.08]"
              )}>
                <ChevronDown className="h-5 w-5" />
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="space-y-6 px-5 pb-5 pt-0">
              <div className="h-px bg-white/8" />

              {finding.evidence && (
                <div className="rounded-md border border-white/8 bg-black/20 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Evidence</p>
                  <p className="text-sm leading-6 text-zinc-300">{finding.evidence}</p>
                </div>
              )}

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                    Security Analysis
                  </h4>
                </div>
                <p className="break-words text-sm leading-6 text-zinc-300">
                  {finding.what_it_means}
                </p>
              </div>

              <div className="rounded-md border border-white/8 bg-black/15 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                    Remediation Steps
                  </h4>
                </div>
                <ol className="space-y-4">
                  {finding.how_to_fix.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-6 text-zinc-300">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-300/20 bg-emerald-300/10 text-[10px] font-bold text-emerald-100">
                        {i + 1}
                      </span>
                      <span className="break-words">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-md border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Agent fix prompt</p>
                    <p className="mt-1 text-sm text-zinc-500">Copy into a local coding agent to implement the fix.</p>
                  </div>
                  <button
                    type="button"
                    onClick={copyFixPrompt}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-300/15"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy prompt"}
                  </button>
                </div>
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-white/8 bg-black/25 p-3 text-xs leading-5 text-zinc-400">
                  {finding.fix_prompt?.trim() || buildFixPrompt(finding)}
                </pre>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
