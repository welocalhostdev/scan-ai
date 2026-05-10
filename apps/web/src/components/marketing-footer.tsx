import Link from "next/link";
import Image from "next/image";
import { getMarketingHref, marketingFooterColumns } from "@/lib/marketing-pages";

export function MarketingFooter() {
  return (
    <footer id="company" className="border-t border-white/14 bg-[#080808] text-white">
      <div className="grid border-b border-white/14 lg:grid-cols-[0.35fr_0.65fr]">
        <div className="border-white/14 bg-white/[0.03] p-8 lg:border-r lg:p-14">
          <div className="flex items-center gap-3">
            <Image src="/logo-light.svg" alt="ScanAI" width={184} height={40} className="h-12 w-auto" />
          </div>
          <div className="mt-20 max-w-sm space-y-5 text-base leading-7 text-white/72">
            <p className="font-semibold text-white">ScanAI Security Inc.</p>
            <p>Automated external security scanning for modern product teams.</p>
            <p>Find risk sooner. Fix what matters. Prove progress clearly.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3">
          {marketingFooterColumns.map((column) => (
            <div key={column.title} className="min-h-80 border-b border-white/14 p-8 md:border-b-0 md:border-r md:p-14 last:md:border-r-0">
              <h3 className="text-lg font-semibold text-white">{column.title}</h3>
              <ul className="mt-8 space-y-5">
                {column.links.map((link) => (
                  <li key={link.slug}>
                    <Link href={getMarketingHref(link)} className="text-base text-white/62 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="mesh-grain-dark bg-[linear-gradient(120deg,rgba(80,166,184,0.72),rgba(12,13,13,0.8)_52%,rgba(238,79,37,0.58))] p-8 md:col-span-3 md:p-14">
            <h3 className="max-w-xl text-3xl font-semibold tracking-tight">Ready to scan your attack surface?</h3>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/72">
              Start with a target URL and get prioritized evidence your engineering team can use.
            </p>
            <Link href="/signup" className="mt-10 inline-flex h-14 items-center bg-white px-8 text-base font-medium text-black transition-colors hover:bg-zinc-200">
              Start scanning
              <span className="ml-6 text-2xl leading-none">»</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-8 py-8 text-sm text-white/62 md:flex-row md:items-center md:justify-between lg:px-14">
        <p>© {new Date().getFullYear()} ScanAI. All rights reserved.</p>
        <div className="flex flex-wrap gap-8">
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          <Link href="/login" className="hover:text-white">Login</Link>
        </div>
      </div>
    </footer>
  );
}
