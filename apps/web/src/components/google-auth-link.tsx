import { cn } from "@/lib/utils";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="#4285F4" d="M21.6 12.23c0-.77-.07-1.51-.2-2.23H12v4.22h5.37a4.59 4.59 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.99-4.31 2.99-7.52Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.61-2.42l-3.23-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.08v2.59A9.99 9.99 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.9A6.02 6.02 0 0 1 6.1 12c0-.66.11-1.3.31-1.9V7.51H3.08A9.99 9.99 0 0 0 2 12c0 1.61.39 3.13 1.08 4.49l3.33-2.59Z" />
      <path fill="#EA4335" d="M12 5.98c1.47 0 2.78.5 3.82 1.49l2.86-2.86A9.61 9.61 0 0 0 12 2a9.99 9.99 0 0 0-8.92 5.51l3.33 2.59C7.2 7.74 9.4 5.98 12 5.98Z" />
    </svg>
  );
}

export function GoogleAuthLink({
  label = "Continue with Google",
  next = "/dashboard",
  variant = "default",
  className,
}: {
  label?: string;
  next?: string;
  variant?: "default" | "hero" | "dark";
  className?: string;
}) {
  const href = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
  return (
    <a
      href={href}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-3 rounded-[4px] border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4",
        variant === "default" && "w-full border-black/14 bg-[#fffefa] text-[#141413] shadow-[inset_0_0_0_1px_rgba(20,20,19,0.04)] hover:bg-[#f2f0eb] focus-visible:ring-[#4fa5b6]/18",
        variant === "hero" && "border-white/16 bg-white px-6 text-black hover:bg-zinc-200 focus-visible:ring-white/20",
        variant === "dark" && "border-white/16 bg-white/[0.08] px-6 text-white hover:bg-white/[0.14] focus-visible:ring-white/20",
        className
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-white shadow-[inset_0_0_0_1px_rgba(20,20,19,0.08)]">
        <GoogleMark className="h-[18px] w-[18px]" />
      </span>
      {label}
    </a>
  );
}
