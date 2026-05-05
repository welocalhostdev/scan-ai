import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Ghost Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20vw] font-bold text-ink-black opacity-[0.02] select-none pointer-events-none">
        404
      </div>

      <div className="relative z-10 text-center px-6">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-pill bg-white border border-ink-black/5 mb-8 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-signal-orange" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">
            Page Not Found
          </span>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-ink-black mb-6">
          Lost in the <br /> <span className="italic font-serif text-slate-gray">digital void.</span>
        </h1>
        
        <p className="text-lg text-slate-gray max-w-md mx-auto mb-12">
          The security perimeter you&apos;re looking for doesn&apos;t exist or has been moved. 
          Let&apos;s get you back to safety.
        </p>

        <Link href="/">
          <Button variant="default" size="lg" className="rounded-pill px-12">
            Return Home
          </Button>
        </Link>
      </div>
    </main>
  );
}
