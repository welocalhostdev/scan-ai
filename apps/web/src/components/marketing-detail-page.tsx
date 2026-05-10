import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, TerminalSquare } from "lucide-react";
import { getMarketingHref, marketingFooterColumns, type MarketingPage } from "@/lib/marketing-pages";

type MarketingDetailPageProps = {
  page: MarketingPage;
};

const groupLabels: Record<MarketingPage["group"], string> = {
  product: "Product",
  teams: "Teams",
  resources: "Resources",
};

export function MarketingDetailPage({ page }: MarketingDetailPageProps) {
  const related = marketingFooterColumns.find((column) => column.title.toLowerCase() === page.group)?.links ?? [];

  return (
    <main className="bg-[#f5f3ee] pt-[76px] text-[#111111]">
      <section className="mesh-grain-dark relative overflow-hidden border-b border-white/12 bg-[linear-gradient(90deg,rgba(32,111,133,0.72),rgba(5,7,8,0.96)_46%,rgba(239,90,42,0.72)),linear-gradient(90deg,rgba(255,255,255,0.09)_1px,transparent_1px)] bg-[length:auto,78px_100%] px-5 py-16 text-white md:px-14 md:py-24">
        <div className="grain-noise absolute inset-0 opacity-35" />
        <div className="relative mx-auto grid max-w-[1680px] gap-12 lg:grid-cols-[minmax(0,0.96fr)_minmax(420px,0.74fr)] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-3 border border-white/14 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/78">
              <ShieldCheck className="h-4 w-4 text-[#8edeea]" />
              {page.eyebrow}
            </div>
            <h1 className="mt-8 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-[-0.02em] md:text-7xl">
              {page.title}
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-white/72">{page.description}</p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex h-14 items-center justify-center bg-white px-7 text-base font-semibold text-black transition-colors hover:bg-zinc-200">
                {page.cta}
                <ArrowRight className="ml-4 h-5 w-5" />
              </Link>
              <Link href="/login" className="inline-flex h-14 items-center justify-center border border-white/18 px-7 text-base font-semibold text-white/84 transition-colors hover:border-white/34 hover:text-white">
                Open command desk
              </Link>
            </div>
          </div>

          <div className="border border-white/16 bg-black/18 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur">
            <div className="flex items-center gap-3 border border-white/12 bg-white/8 px-4 py-3 font-mono text-sm text-white/78">
              <TerminalSquare className="h-4 w-4 text-[#8edeea]" />
              {page.command}
            </div>
            <div className="mt-5 grid gap-3">
              {page.workflow.map((step, index) => (
                <div key={step} className="grid grid-cols-[44px_1fr] items-center border border-white/12 bg-white/[0.055] p-4">
                  <span className="font-mono text-sm text-[#8edeea]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="text-base font-semibold text-white">{step}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 border-l border-[#ef5a2a] pl-4 text-sm leading-6 text-white/66">{page.proof}</p>
          </div>
        </div>
      </section>

      <section className="mesh-grain-light border-b border-black/12 bg-white px-5 py-14 md:px-14 md:py-20">
        <div className="mx-auto grid max-w-[1680px] gap-5 lg:grid-cols-3">
          {page.outcomes.map((outcome) => (
            <div key={outcome} className="border border-black/12 bg-[#fbfaf7] p-6 shadow-sm">
              <Check className="h-5 w-5 text-[#4fa5b6]" />
              <p className="mt-8 max-w-sm text-2xl font-semibold leading-tight tracking-[-0.01em]">{outcome}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#f5f3ee] px-5 py-14 md:px-14 md:py-20">
        <div className="mx-auto grid max-w-[1680px] gap-8 lg:grid-cols-[0.72fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#4fa5b6]">{groupLabels[page.group]}</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.02em] md:text-5xl">
              Built for a clear scan-to-remediation flow.
            </h2>
          </div>
          <div className="grid gap-3">
            {page.workflow.map((step, index) => (
              <div key={step} className="grid gap-4 border border-black/12 bg-white p-5 md:grid-cols-[90px_1fr]">
                <span className="font-mono text-sm uppercase tracking-[0.22em] text-black/42">Step {index + 1}</span>
                <div>
                  <h3 className="text-xl font-semibold">{step}</h3>
                  <p className="mt-2 max-w-2xl text-base leading-7 text-black/60">
                    {index === 0 && "Start from a concrete target or workspace state, then keep the page focused on the job at hand."}
                    {index === 1 && "ScanAI organizes the signal so reviewers can see what matters without digging through raw scanner output."}
                    {index === 2 && "The final handoff stays practical: evidence, priority, and next action in one clean workflow."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-black/12 bg-[#080808] px-5 py-14 text-white md:px-14 md:py-20">
        <div className="mx-auto grid max-w-[1680px] gap-10 md:grid-cols-[0.86fr_1.14fr] md:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/44">More in {groupLabels[page.group]}</p>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.02em]">Explore the rest of the workflow.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((item) => (
              <Link
                key={item.slug}
                href={getMarketingHref(item)}
                className="group flex min-h-24 items-center justify-between border border-white/14 bg-white/[0.035] p-5 transition-colors hover:border-white/28 hover:bg-white/[0.065]"
              >
                <span className="text-lg font-semibold text-white/86 group-hover:text-white">{item.label}</span>
                <ArrowRight className="h-5 w-5 text-white/38 transition-transform group-hover:translate-x-1 group-hover:text-[#8edeea]" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
