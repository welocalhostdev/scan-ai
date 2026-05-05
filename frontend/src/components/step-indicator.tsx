"use client";

import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: number;
  failed: boolean;
}

const STEPS = [
  {
    label: "Advanced Reconnaissance",
    description: "Discovering all subdomains via 50+ intelligence sources",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    label: "Host Probing",
    description: "Verifying active endpoints and technology stacks",
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
    label: "Vulnerability Assessment",
    description: "Scanning for CVEs and configuration weaknesses",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: "TLS Intelligence",
    description: "Analyzing certificate integrity and handshake security",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    ),
  },
  {
    label: "Synthesizing Report",
    description: "AI-driven prioritization and remediation planning",
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

export function StepIndicator({ currentStep, failed }: StepIndicatorProps) {
  return (
    <div className="w-full space-y-4">
      {STEPS.map((step, index) => {
        const stepNumber = index + 1;
        const isComplete = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;
        const isPending = currentStep < stepNumber;
        const isFailed = failed && isActive;

        return (
          <div key={stepNumber} className="relative flex items-center gap-6 group">
            {/* Vertical connector line */}
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "absolute left-6 top-10 w-0.5 h-10 transition-all duration-700",
                  isComplete ? "bg-signal-orange" : "bg-ink-black/5"
                )}
              />
            )}

            {/* Circle */}
            <div
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 relative shrink-0 z-10",
                isComplete && "bg-signal-orange text-white",
                isActive && !isFailed && "bg-ink-black text-white ring-8 ring-ink-black/5",
                isFailed && "bg-destructive text-white",
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

            {/* Text Content */}
            <div className={cn(
              "text-left transition-all duration-300",
              isPending && "opacity-30"
            )}>
              <p
                className={cn(
                  "font-medium text-base tracking-tight",
                  (isComplete || isActive) ? "text-ink-black" : "text-ink-black/40"
                )}
              >
                {step.label}
              </p>
              <p className="text-xs text-slate-gray font-medium">
                {step.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

