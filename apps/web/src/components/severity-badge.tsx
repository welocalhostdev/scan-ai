import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
  count?: number;
}

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; className: string; dotClass: string }
> = {
  critical: {
    label: "Critical",
    className: "bg-[#EB001B]/10 text-[#EB001B] border-[#EB001B]/20",
    dotClass: "bg-[#EB001B]",
  },
  high: {
    label: "High",
    className: "bg-[#CF4500]/10 text-[#CF4500] border-[#CF4500]/20",
    dotClass: "bg-[#CF4500]",
  },
  medium: {
    label: "Medium",
    className: "bg-[#F79E1B]/10 text-[#F79E1B] border-[#F79E1B]/20",
    dotClass: "bg-[#F79E1B]",
  },
  low: {
    label: "Low",
    className: "bg-[#3860BE]/10 text-[#3860BE] border-[#3860BE]/20",
    dotClass: "bg-[#3860BE]",
  },
  info: {
    label: "Info",
    className: "bg-slate-gray/10 text-slate-gray border-slate-gray/20",
    dotClass: "bg-slate-gray",
  },
};

export function SeverityBadge({
  severity,
  className,
  count,
}: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-bold text-[10px] px-3 py-1 gap-1.5 transition-colors border rounded-full uppercase tracking-wider",
        config.className,
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          config.dotClass
        )}
      />
      {config.label}
      {count !== undefined && (
        <span className="ml-1 opacity-60">({count})</span>
      )}
    </Badge>
  );
}

