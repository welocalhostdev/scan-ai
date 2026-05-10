"use client";

import { cn } from "@/lib/utils";
import type { SubTaskStatus } from "@/lib/api";

interface StepIndicatorProps {
  currentStep: number;
  failed: boolean;
  subTasks?: Record<string, SubTaskStatus> | null;
}

const STEPS = [
  {
    label: "Advanced Reconnaissance",
    description: "Discovering all subdomains via 50+ intelligence sources",
    toolKey: "subfinder",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    label: "DNS Validation",
    description: "Resolving discovered hosts and collecting DNS records before probing",
    toolKey: "dnsx",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v6" />
        <path d="M12 15v6" />
        <path d="M3 12h6" />
        <path d="M15 12h6" />
      </svg>
    ),
  },
  {
    label: "Host Probing",
    description: "Verifying active endpoints and technology stacks",
    toolKey: "httpx",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    label: "Service Mapping",
    description: "Identifying exposed services and open ports",
    toolKey: "naabu",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    label: "Deep Crawling",
    description: "Mapping logic flows, hidden forms, and API routes",
    toolKey: "katana",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    label: "Website Intelligence",
    description: "Checking headers, cookies, redirects, robots, sitemap, DNSSEC, and mail policy",
    toolKey: "webcheck",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 5h18" />
        <path d="M5 5v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
        <path d="M16 17l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Tech Fingerprinting",
    description: "Identifying visible frameworks, CMS, CDN, and security-edge products",
    toolKey: "webanalyze",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M4 6h16" />
        <path d="M4 12h10" />
        <path d="M4 18h7" />
        <circle cx="18" cy="17" r="3" />
        <path d="M20.5 19.5 22 21" />
      </svg>
    ),
  },
  {
    label: "WAF Detection",
    description: "Fingerprinting web application firewall and edge protection signals",
    toolKey: "wafw00f",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </svg>
    ),
  },
  {
    label: "Vulnerability Assessment",
    description: "Scanning for CVEs and configuration weaknesses",
    toolKey: "nuclei",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: "API Exposure Checks",
    description: "Checking API docs, GraphQL, CORS, and API misconfiguration signals",
    toolKey: "nuclei_api",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M4 7h16" />
        <path d="M4 12h10" />
        <path d="M4 17h7" />
        <path d="M17 14l3 3-3 3" />
      </svg>
    ),
  },
  {
    label: "Hidden API Discovery",
    description: "Fuzzing common API roots and documentation endpoints with bounded wordlists",
    toolKey: "ffuf_api",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M4 5h16" />
        <path d="M4 12h16" />
        <path d="M4 19h10" />
        <path d="M17 16l3 3-3 3" />
      </svg>
    ),
  },
  {
    label: "Parameter Discovery",
    description: "Identifying hidden GET and POST parameters on likely API endpoints",
    toolKey: "arjun",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="6" cy="7" r="2" />
        <circle cx="18" cy="17" r="2" />
        <path d="M8 7h8a2 2 0 0 1 2 2v6" />
        <path d="M16 17H8a2 2 0 0 1-2-2V9" />
      </svg>
    ),
  },
  {
    label: "Schema Discovery",
    description: "Finding and parsing exposed OpenAPI or Swagger contracts",
    toolKey: "openapi",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    ),
  },
  {
    label: "TLS Intelligence",
    description: "Analyzing certificate integrity and handshake security",
    toolKey: "testssl",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    ),
  },
  {
    label: "Certificate Inventory",
    description: "Collecting fast TLS and certificate metadata across live hosts",
    toolKey: "tlsx",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Synthesizing Report",
    description: "AI-driven prioritization and remediation planning",
    toolKey: "ai",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SubTaskDot({ status }: { status: SubTaskStatus }) {
  if (status === "complete") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 text-signal-orange">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "running") {
    return (
      <span className="relative flex h-4 w-4 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-orange opacity-60" />
        <span className="absolute inline-flex h-3 w-3 animate-pulse rounded-full bg-signal-orange" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
    );
  }
  if (status === "failed") {
    return <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" />;
  }
  return <span className="w-3 h-3 rounded-full border border-ink-black/15" />;
}

function RunningAnimation() {
  return (
    <span className="inline-flex items-center gap-1 ml-2">
      <span className="w-1 h-1 rounded-full bg-signal-orange animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1 h-1 rounded-full bg-signal-orange animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1 h-1 rounded-full bg-signal-orange animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

export function StepIndicator({ currentStep, failed, subTasks }: StepIndicatorProps) {
  return (
    <div className="w-full space-y-4">
      {STEPS.map((step, index) => {
        const stepNumber = index + 1;
        const isCurrentStep = currentStep === stepNumber;
        const isPastStep = currentStep > stepNumber;

        // Prefer the live tool status, but infer "running" for the active step
        // so the UI still highlights when the backend state lags a little.
        const rawToolStatus = subTasks?.[step.toolKey];
        const toolStatus: SubTaskStatus = rawToolStatus
          ?? (isCurrentStep ? "running" : isPastStep ? "complete" : "pending");

        const isComplete = toolStatus === "complete" || (!rawToolStatus && isPastStep);
        const isActive = !failed && toolStatus === "running";
        const isFailed = (failed && isCurrentStep) || toolStatus === "failed";
        const isPending = !isComplete && !isActive && !isFailed;

        return (
          <div key={stepNumber} className="relative flex items-start gap-6 group">
            {/* Vertical connector line */}
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "absolute left-6 top-10 w-0.5 h-10 transition-all duration-700",
                  (isComplete || isActive) ? "bg-signal-orange" : "bg-ink-black/5"
                )}
              />
            )}

            {/* Circle */}
            <div className="relative shrink-0 z-10 mt-0.5">
              {/* Pulsing ring for active step */}
              {isActive && (
                <span className="absolute inset-0 rounded-full bg-signal-orange/30 animate-ping" />
              )}
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 relative",
                  isComplete && "bg-signal-orange text-white shadow-[0_8px_24px_rgba(249,115,22,0.25)]",
                  isActive && "bg-ink-black text-white ring-4 ring-signal-orange/50 shadow-[0_10px_28px_rgba(0,0,0,0.16)] scale-[1.03]",
                  isFailed && "bg-destructive text-white shadow-[0_8px_24px_rgba(239,68,68,0.25)]",
                  isPending && "bg-white border border-ink-black/10 text-ink-black/30"
                )}
              >
                {isComplete ? (
                  <CheckIcon />
                ) : isFailed ? (
                  <FailIcon />
                ) : (
                  step.icon
                )}
              </div>
            </div>

            {/* Text Content */}
            <div className={cn(
              "text-left transition-all duration-300 flex-1 min-w-0",
              isPending && "opacity-30"
            )}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p
                    className={cn(
                      "font-medium text-base tracking-tight transition-colors",
                      isComplete && "text-signal-orange",
                      isActive && "text-ink-black",
                      isPending && "text-ink-black/40",
                      isFailed && "text-destructive"
                    )}
                  >
                    {step.label}
                  </p>
                  <p className={cn(
                    "text-xs font-medium transition-colors",
                    isActive ? "text-ink-black/75" : "text-slate-gray"
                  )}>
                    {step.description}
                  </p>
                </div>

                {/* Real-time status indicator */}
                {(isActive || isComplete || toolStatus !== "pending") && (
                   <div className="flex items-center gap-2">
                     <SubTaskDot status={toolStatus} />
                     <span className={cn(
                       "text-[10px] font-bold uppercase tracking-wider",
                       toolStatus === "complete" && "text-signal-orange",
                       toolStatus === "running" && "text-ink-black animate-pulse",
                       toolStatus === "failed" && "text-destructive",
                       toolStatus === "pending" && "text-ink-black/20"
                     )}>
                       {toolStatus}
                       {toolStatus === "running" && <RunningAnimation />}
                     </span>
                   </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
