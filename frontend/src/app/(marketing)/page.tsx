"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col">
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 max-w-7xl mx-auto w-full">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-ink-black/5 mb-8 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-orange" />
            <span className="text-[11px] font-bold tracking-[0.15em] text-ink-black uppercase">
              Enterprise-Grade Security Intelligence
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight text-ink-black leading-[1.05] mb-8">
            Find vulnerabilities{" "}
            <span className="text-slate-gray">before</span>{" "}
            they find you.
          </h1>

          <p className="text-lg md:text-xl text-slate-gray max-w-2xl mx-auto leading-relaxed mb-10">
            ScanAI combines automated reconnaissance, vulnerability scanning, and
            AI-powered analysis into actionable security reports your team can use.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="rounded-full px-8 h-12 text-sm font-semibold bg-ink-black text-canvas-cream hover:bg-ink-black/90">
                Start scanning free
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="rounded-full px-8 h-12 text-sm font-semibold border-ink-black/10">
                View demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Social Proof ──────────────────────────────────── */}
      <section className="py-12 border-y border-ink-black/5 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-[11px] font-bold tracking-[0.2em] uppercase text-ink-black/30 mb-8">
            Trusted by security-conscious engineering teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-40">
            {["Acme Corp", "Globex", "Initech", "Umbrella", "Hooli"].map((name) => (
              <span key={name} className="text-sm font-semibold tracking-tight text-ink-black">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="py-32 px-6 max-w-7xl mx-auto w-full">
        <div className="text-center mb-20">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-signal-orange mb-4">
            Capabilities
          </p>
          <h2 className="text-4xl md:text-5xl font-medium text-ink-black tracking-tight">
            Everything you need to stay secure.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: "AI Deep Analysis",
              desc: "Autonomous agents analyze findings to eliminate false positives and prioritize what actually matters to your infrastructure.",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                  <path d="M12 12L2.5 12.5a10 10 0 0 0 19 0L12 12z" />
                </svg>
              ),
            },
            {
              title: "Global Reconnaissance",
              desc: "Connects to 50+ threat intelligence sources. Maps your full attack surface including subdomains, ports, and hidden endpoints.",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              ),
            },
            {
              title: "Actionable Remediation",
              desc: "Receive plain-English reports with severity ratings, step-by-step fixes, and production-ready code snippets.",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              ),
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="group p-8 rounded-3xl bg-white border border-ink-black/5 hover:border-ink-black/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="w-12 h-12 rounded-xl bg-ink-black/5 text-ink-black flex items-center justify-center mb-6 group-hover:bg-signal-orange group-hover:text-white transition-colors duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-ink-black mb-3 tracking-tight">
                {feature.title}
              </h3>
              <p className="text-sm text-slate-gray leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section id="how-it-works" className="py-32 px-6 bg-lifted-cream">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-signal-orange mb-4">
              How it works
            </p>
            <h2 className="text-4xl md:text-5xl font-medium text-ink-black tracking-tight">
              Security intelligence in three steps.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                step: "01",
                title: "Submit your target",
                desc: "Enter a URL and our engine immediately begins passive and active reconnaissance across 50+ intelligence sources.",
              },
              {
                step: "02",
                title: "Automated scanning",
                desc: "Our pipeline runs subdomain discovery, host probing, port scanning, crawling, and vulnerability detection in parallel.",
              },
              {
                step: "03",
                title: "AI-generated report",
                desc: "Receive a prioritized, plain-English security report with risk scores, findings, and step-by-step remediation guidance.",
              },
            ].map((item) => (
              <div key={item.step} className="relative">
                <span className="text-6xl font-medium text-ink-black/5 select-none">
                  {item.step}
                </span>
                <div className="-mt-8">
                  <h3 className="text-xl font-semibold text-ink-black mb-3 tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-gray leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────── */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto bg-ink-black rounded-4xl p-12 md:p-20 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0,100 C30,40 70,40 100,100" fill="none" stroke="white" strokeWidth="0.1" />
            </svg>
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-medium text-canvas-cream tracking-tight mb-6">
              Ready to secure your infrastructure?
            </h2>
            <p className="text-slate-gray/70 max-w-lg mx-auto mb-10 leading-relaxed">
              Join hundreds of teams using ScanAI to find and fix vulnerabilities before attackers do.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/signup">
                <Button size="lg" className="rounded-full px-10 h-12 bg-canvas-cream text-ink-black hover:bg-white font-semibold">
                  Get started free
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="ghost" className="rounded-full px-10 h-12 text-canvas-cream hover:bg-white/10 font-semibold">
                  Log in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

