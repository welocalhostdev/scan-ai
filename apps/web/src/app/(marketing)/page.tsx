"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Code2,
  FileText,
  Globe2,
  LockKeyhole,
  Radar,
  ShieldAlert,
  TerminalSquare,
} from "lucide-react";

const trustSignals = ["External scans", "API discovery", "Risk reports", "AI triage", "Fix prompts"];

const noisePipeline = [
  {
    icon: TerminalSquare,
    step: "01",
    label: "Scanner output",
    title: "Hundreds of events land without context.",
    text: "Routes, headers, status codes, templates, and scanner notes arrive as disconnected fragments.",
    meta: "247 raw signals",
  },
  {
    icon: Globe2,
    step: "02",
    label: "Evidence grouping",
    title: "ScanAI keeps only the retained proof.",
    text: "Reachable assets, duplicated findings, and low-value noise are grouped into a reviewable risk story.",
    meta: "27 retained findings",
  },
  {
    icon: ShieldAlert,
    step: "03",
    label: "Risk handoff",
    title: "Engineers get the why, where, and fix.",
    text: "Every report includes affected assets, priority, evidence, and remediation prompts that can become tickets.",
    meta: "1 clean handoff",
  },
];

const outcomeMetrics = [
  ["12x", "faster first-pass triage"],
  ["8", "scanner stages coordinated"],
  ["1", "shareable remediation report"],
  ["24/7", "external exposure visibility"],
];

const stackItems = [
  {
    icon: Radar,
    title: "Attack surface mapping",
    text: "Find domains, hosts, routes, ports, TLS issues, headers, and API signals from a single target.",
  },
  {
    icon: Bot,
    title: "AI triage and grouping",
    text: "Collapse noisy scanner output into a clean queue organized by exploitability and business impact.",
  },
  {
    icon: FileText,
    title: "Engineer-ready reports",
    text: "Generate remediation notes with evidence, affected assets, severity, and focused fix prompts.",
  },
  {
    icon: LockKeyhole,
    title: "Continuous monitoring",
    text: "Keep external exposure visible as your product, infrastructure, and dependencies change.",
  },
];

const reportRows = [
  ["Critical", "Exposed admin route", "Unauthenticated route reachable from public internet"],
  ["High", "Weak TLS posture", "Deprecated cipher accepted by public endpoint"],
  ["Medium", "Missing security headers", "HSTS and CSP hardening recommended"],
  ["Low", "Informational leakage", "Server metadata exposed in response headers"],
];

const coverageItems = [
  "Subdomain discovery",
  "Live host probing",
  "Port scanning",
  "Endpoint crawling",
  "TLS review",
  "Header analysis",
  "API route detection",
  "XSS checks",
  "Nuclei templates",
  "AI report generation",
];

const stages = [
  {
    title: "Startup",
    text: "Launch a security program without hiring a full security team.",
    checks: ["External scan history", "Prioritized fixes", "Shareable PDF reports"],
  },
  {
    title: "Midmarket",
    text: "Replace scattered tools with one repeatable scanning workflow.",
    checks: ["API surface discovery", "Remediation prompts", "Historical risk posture"],
  },
  {
    title: "Enterprise",
    text: "Give product security teams a faster way to brief engineering.",
    checks: ["Asset-level evidence", "Risk scoring", "Continuous reconnaissance"],
  },
];

const faqs = [
  {
    q: "What does ScanAI scan?",
    a: "ScanAI starts from a target URL and maps reachable hosts, ports, routes, headers, TLS posture, API signals, and retained vulnerability evidence.",
  },
  {
    q: "Is this a replacement for manual penetration testing?",
    a: "No. It is designed for fast external reconnaissance, continuous monitoring, and remediation handoff. Manual testing is still important for authenticated and business-logic issues.",
  },
  {
    q: "What does the AI do?",
    a: "AI summarizes evidence, groups related findings, explains risk in plain English, and creates fix prompts that engineers can use in their local workflow.",
  },
  {
    q: "Can I share reports?",
    a: "Yes. Completed scans can produce structured reports and PDFs with severity, affected assets, evidence, and remediation steps.",
  },
];

function HeroVisual() {
  const scrollY = useParallax();
  const softShift = Math.min(scrollY * 0.12, 80);
  const gridShift = Math.min(scrollY * 0.06, 42);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -inset-y-24 inset-x-0 bg-[linear-gradient(90deg,rgba(25,103,129,0.9),rgba(5,8,9,0.94)_43%,rgba(242,83,36,0.86)_82%,rgba(82,123,118,0.72))]"
        style={{ transform: `translate3d(0, ${softShift}px, 0)` }}
      />
      <video
        className="absolute -inset-y-12 left-0 h-[calc(100%+6rem)] w-full object-cover motion-reduce:hidden"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ transform: `translate3d(0, ${Math.min(softShift * 0.42, 34)}px, 0) scale(1.03)` }}
      >
        <source src="/scanai-hero-bg.mp4?v=abstract-bg" type="video/mp4" />
      </video>
      <div
        className="grain-noise absolute -inset-y-24 inset-x-0 opacity-34"
        style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.04, 34)}px, 0)` }}
      />
      <div
        className="absolute -inset-y-20 inset-x-0 opacity-20 [background-image:linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:9.1vw_100%,100%_128px]"
        style={{ transform: `translate3d(0, ${gridShift}px, 0)` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_46%,rgba(0,0,0,0.78),transparent_24%),linear-gradient(90deg,rgba(0,0,0,0.1),rgba(0,0,0,0.08)_58%,rgba(0,0,0,0.02)),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.12))]" />
    </div>
  );
}

function useParallax() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollY(window.scrollY));
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
    };
  }, []);

  return scrollY;
}

function ScannerNoiseSection({ scrollY }: { scrollY: number }) {
  const lineShift = Math.min(Math.max((scrollY - 500) * 0.04, 0), 90);

  return (
    <section id="product" className="mesh-grain-dark relative overflow-hidden bg-[#080808] px-6 py-24 text-white md:px-14 md:py-32">
      <div
        className="absolute -inset-y-24 inset-x-0 opacity-70 [background:linear-gradient(90deg,rgba(22,97,121,0.78),rgba(5,7,8,0.98)_44%,rgba(239,80,38,0.78)_86%)]"
        style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.025, 42)}px, 0)` }}
      />
      <div className="grain-noise absolute inset-0 opacity-28" />
      <div
        className="absolute -inset-y-16 inset-x-0 opacity-18 [background-image:linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:9.09vw_100%,100%_132px]"
        style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.05, 62)}px, 0)` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_38%,rgba(0,0,0,0.86),transparent_24%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.42))]" />

      <div className="relative mx-auto grid max-w-[1680px] gap-14 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <div className="reveal-on-scroll lg:sticky lg:top-28">
          <div className="inline-flex items-center gap-3 border border-white/14 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/78">
            <span className="h-2 w-2 rounded-full bg-[#ef5a2a]" />
            AI triage
          </div>
          <h2 className="mt-8 max-w-5xl text-5xl font-semibold leading-[0.96] tracking-[-0.025em] md:text-7xl">
            Scanner noise slows real security work.
          </h2>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/72">
            ScanAI turns raw scanner output into retained evidence, risk context, and engineer-ready remediation without another cleanup spreadsheet.
          </p>
          <div className="mt-10 grid max-w-2xl grid-cols-3 border border-white/14 bg-white/[0.035]">
            {[
              ["247", "raw signals"],
              ["27", "retained findings"],
              ["1", "handoff"],
            ].map(([value, label]) => (
              <div key={label} className="border-r border-white/14 p-5 last:border-r-0">
                <p className="font-mono text-3xl font-semibold text-white">{value}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/42">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-10 hidden h-[calc(100%-80px)] w-px bg-white/12 md:block">
            <div className="h-24 w-px bg-gradient-to-b from-transparent via-[#8edeea] to-transparent" style={{ transform: `translate3d(0, ${lineShift}px, 0)` }} />
          </div>
          <div className="space-y-5">
            {noisePipeline.map((item, index) => {
              const Icon = item.icon;
              const lift = Math.min(Math.max((scrollY - 540 - index * 120) * 0.025, -12), 22);

              return (
                <article
                  key={item.title}
                  className="reveal-on-scroll group relative border border-white/14 bg-white/[0.055] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.2)] backdrop-blur transition-colors hover:border-white/28 hover:bg-white/[0.075] md:ml-14 md:p-7"
                  style={{ transform: `translate3d(0, ${lift}px, 0)` }}
                >
                  <div className="grid gap-5 md:grid-cols-[84px_1fr_auto] md:items-start">
                    <div className="flex h-16 w-16 items-center justify-center border border-white/14 bg-black/20 text-[#8edeea]">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="mb-4 flex flex-wrap items-center gap-3">
                        <span className="font-mono text-xs text-white/38">{item.step}</span>
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8edeea]">{item.label}</span>
                      </div>
                      <h3 className="max-w-2xl text-2xl font-semibold leading-tight text-white md:text-3xl">{item.title}</h3>
                      <p className="mt-4 max-w-2xl text-base leading-7 text-white/62">{item.text}</p>
                    </div>
                    <div className="border border-white/12 bg-white/7 px-4 py-3 font-mono text-sm text-white/74">
                      {item.meta}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const scrollY = useParallax();

  return (
    <main className="flex-1 bg-white text-black">
      <section className="relative min-h-[780px] overflow-hidden pt-[76px] text-white">
        <HeroVisual />
        <div className="relative z-10 flex min-h-[704px] flex-col justify-center px-6 py-16 md:px-14">
          <div className="max-w-[1680px]">
            <h1 className="max-w-6xl text-6xl font-semibold leading-none md:text-7xl xl:text-8xl">
              Scan your attack surface. Ship fixes faster.
            </h1>
            <p className="mt-8 max-w-3xl text-lg leading-8 text-white/84 md:text-xl">
              ScanAI maps reachable assets, detects exposed services and API risks, then turns findings into clear remediation reports for engineering teams.
            </p>
            <Link href="/signup" className="mt-10 inline-flex h-14 items-center bg-white px-8 text-base font-medium text-black transition-colors hover:bg-zinc-200">
              Start scanning
              <span className="ml-7 text-2xl leading-none">»</span>
            </Link>
            <p className="mt-28 text-base text-white/80">Built for teams that need external security visibility without manual scanner cleanup</p>
          </div>
        </div>
      </section>

      <section className="mesh-grain-light border-y border-black/14 bg-white">
        <div className="mx-auto grid max-w-[1720px] grid-cols-2 divide-x divide-black/12 text-center md:grid-cols-5">
          {trustSignals.map((signal) => (
            <div key={signal} className="px-4 py-8 text-base font-medium text-black/58">
              {signal}
            </div>
          ))}
        </div>
      </section>

      <ScannerNoiseSection scrollY={scrollY} />

      <section className="mesh-grain-light border-y border-black/14 bg-[#f7f7f4] px-6 py-16 md:px-14">
        <div className="mx-auto grid max-w-[1440px] gap-px border border-black/14 bg-black/14 md:grid-cols-4">
          {outcomeMetrics.map(([value, label]) => (
            <div key={label} className="bg-[#f7f7f4] p-8">
              <p className="font-mono text-5xl font-semibold text-black">{value}</p>
              <p className="mt-3 max-w-44 text-base leading-6 text-black/58">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mesh-grain-dark relative overflow-hidden bg-[#090909] px-6 py-24 text-white md:px-14 md:py-28">
        <div className="absolute inset-0 opacity-80 [background:linear-gradient(90deg,rgba(23,89,112,0.65),rgba(9,9,9,0.96)_48%,rgba(239,80,38,0.72))]" />
        <div className="grain-noise absolute inset-0 opacity-16" />
        <div
          className="absolute -inset-y-16 inset-x-0 opacity-16 [background-image:linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:12.5vw_100%]"
          style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.045, 52)}px, 0)` }}
        />
        <div className="relative mx-auto max-w-[1440px] text-center">
          <h2 className="mx-auto max-w-5xl text-5xl font-semibold leading-tight md:text-6xl xl:text-7xl">
            From target URL to prioritized report.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/76">
            ScanAI runs reconnaissance, probes reachable services, groups evidence, and produces engineering-ready remediation guidance.
          </p>
          <Link href="/signup" className="mt-10 inline-flex h-14 items-center bg-white px-8 text-base font-medium text-black transition-colors hover:bg-zinc-200">
            Start scanning
            <span className="ml-7 text-2xl leading-none">»</span>
          </Link>
        </div>
      </section>

      <section className="mesh-grain-light bg-white px-6 py-24 md:px-14 md:py-28">
        <div className="mx-auto grid max-w-[1440px] gap-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase text-[#4fa5b6]">Report Output</p>
            <h2 className="mt-4 max-w-xl text-5xl font-semibold leading-tight md:text-6xl">
              Evidence your engineers can act on.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-black/62">
              Every completed scan keeps the important context together: severity, affected asset, scanner evidence, risk explanation, and remediation steps.
            </p>
          </div>

          <div className="border border-black/14 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-black/14 p-5">
              <div>
                <p className="text-sm font-semibold text-black">Scan report</p>
                <p className="mt-1 font-mono text-xs text-black/46">https://scanai.welocalhost.com</p>
              </div>
              <span className="bg-[#fff0ea] px-3 py-1 text-sm font-medium text-[#ef5a2a]">27 findings</span>
            </div>
            <div className="divide-y divide-black/10">
              {reportRows.map(([severity, title, evidence]) => (
                <div key={title} className="grid gap-3 p-5 md:grid-cols-[92px_1fr]">
                  <span className="h-fit border border-black/14 px-3 py-1 text-center text-sm font-medium text-black/62">
                    {severity}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-base leading-7 text-black/58">{evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="resources" className="mesh-grain-light bg-white px-6 py-24 md:px-14 md:py-28">
        <div className="mx-auto max-w-[1440px] text-center">
          <h2 className="mx-auto max-w-4xl text-5xl font-semibold leading-tight md:text-6xl xl:text-7xl">
            The AI security stack
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-black/64">
            ScanAI takes a different approach to security scanning, with AI accelerating every step from discovery to remediation.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-[1440px] border border-black/14 md:grid-cols-2">
          {stackItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="min-h-[360px] border-b border-black/14 p-8 md:border-r md:p-10 even:md:border-r-0">
                <div className="mb-10 flex h-16 w-16 items-center justify-center border border-black/14 bg-[#fff4ef] text-[#ef5a2a]">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="max-w-xl text-3xl font-semibold">{item.title}</h3>
                <p className="mt-5 max-w-xl text-lg leading-8 text-black/58">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mesh-grain-light border-y border-black/14 bg-[#f7f7f4] px-6 py-24 md:px-14 md:py-28">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid gap-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase text-[#ef5a2a]">Coverage</p>
              <h2 className="mt-4 max-w-xl text-5xl font-semibold leading-tight md:text-6xl">
                One scan, multiple security passes.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-8 text-black/62">
              ScanAI coordinates discovery, probing, vulnerability checks, and AI summarization so you get a cleaner result than running each tool in isolation.
            </p>
          </div>

          <div className="mt-16 grid border border-black/14 bg-white md:grid-cols-2 lg:grid-cols-5">
            {coverageItems.map((item) => (
              <div key={item} className="flex min-h-32 items-end border-b border-r border-black/14 p-5 last:border-r-0">
                <p className="text-base font-medium text-black/72">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mesh-grain-dark bg-[#10100f] px-6 py-24 text-white md:px-14 md:py-28">
        <div className="mx-auto max-w-[1440px] text-center">
          <h2 className="mx-auto max-w-4xl text-5xl font-semibold leading-tight md:text-6xl xl:text-7xl">
            Configure scans around your risk.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/58">
            Choose the modules that fit your target, add AI workflows, and send engineers a clean remediation queue.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-[1440px] gap-8 lg:grid-cols-3">
          <div className="border border-white/18 p-8">
            <h3 className="text-3xl font-semibold">1. Choose scan modules</h3>
            <div className="mt-8 flex flex-wrap gap-3">
              {["CVE", "TLS", "Headers", "Ports", "API docs", "Crawling", "XSS", "Subdomains", "BOLA"].map((item) => (
                <span key={item} className="inline-flex items-center gap-3 border border-white/24 px-3 py-2 text-sm text-white/82">
                  {item}
                  <span className="h-4 w-4 border border-white/38" />
                </span>
              ))}
            </div>
          </div>

          <div className="border border-white/18 p-8">
            <h3 className="text-3xl font-semibold">2. Add AI workflows</h3>
            <div className="mt-8 space-y-3">
              {["Remediation prompt", "Evidence summary", "PDF report", "Risk scoring", "Asset grouping"].map((item) => (
                <div key={item} className="inline-flex items-center border border-[#4fa5b6] text-base">
                  <span className="bg-[#4fa5b6] px-3 py-2 font-medium text-white">AI</span>
                  <span className="px-3 py-2 text-white/82">{item}</span>
                  <span className="px-3 text-[#4fa5b6]"><Check className="h-4 w-4" /></span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-white/18 bg-[linear-gradient(135deg,rgba(239,80,38,0.24),rgba(79,165,182,0.18))] p-8">
            <h3 className="text-3xl font-semibold">3. Run the scan</h3>
            <p className="mt-8 text-lg leading-8 text-white/62">
              Get prioritized issues, affected assets, and engineer-ready fixes in one workspace.
            </p>
            <Link href="/signup" className="mt-24 flex h-16 items-center justify-center bg-[#ef5126] px-8 text-lg font-medium text-white transition-colors hover:bg-[#db431c]">
              Start scanning today
            </Link>
          </div>
        </div>
      </section>

      <section className="mesh-grain-light bg-white px-6 py-24 md:px-14 md:py-28">
        <div className="mx-auto max-w-[1440px] text-center">
          <h2 className="mx-auto max-w-4xl text-5xl font-semibold leading-tight md:text-6xl xl:text-7xl">
            Built for every security stage
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-black/64">
            ScanAI eliminates vulnerability busywork whether you are running your first scan or managing a mature product security program.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-[1440px] border border-black/14 lg:grid-cols-3">
          {stages.map((stage) => (
            <article key={stage.title} className="border-b border-black/14 p-8 lg:border-b-0 lg:border-r lg:p-12 last:lg:border-r-0">
              <div className="mb-12 flex h-20 w-20 items-center justify-center rounded-full border border-[#ef5a2a]/30 bg-[#fff4ef] text-[#ef5a2a]">
                <Code2 className="h-8 w-8" />
              </div>
              <h3 className="text-4xl font-semibold">{stage.title}</h3>
              <p className="mt-8 min-h-20 text-xl leading-8 text-black/72">{stage.text}</p>
              <div className="my-10 h-px bg-black/14" />
              <ul className="space-y-5 text-left">
                {stage.checks.map((check) => (
                  <li key={check} className="flex items-start gap-4 text-lg leading-7 text-black/76">
                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center bg-[#4fa5b6] text-white">
                      <Check className="h-4 w-4" />
                    </span>
                    {check}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="mt-14 inline-flex h-14 items-center bg-black px-8 text-base font-medium text-white transition-colors hover:bg-zinc-800">
                Start scanning
                <span className="ml-6 text-2xl leading-none">»</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mesh-grain-light border-t border-black/14 bg-white px-6 py-24 md:px-14 md:py-28">
        <div className="mx-auto grid max-w-[1440px] gap-14 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-[#4fa5b6]">Questions</p>
            <h2 className="mt-4 max-w-xl text-5xl font-semibold leading-tight md:text-6xl">
              Built for practical security work.
            </h2>
          </div>

          <div className="border border-black/14">
            {faqs.map((faq) => (
              <div key={faq.q} className="border-b border-black/14 p-6 last:border-b-0">
                <h3 className="text-xl font-semibold">{faq.q}</h3>
                <p className="mt-3 text-base leading-7 text-black/62">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
