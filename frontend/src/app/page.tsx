"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ScanInput } from "@/components/scan-input";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <main className="flex-1 flex flex-col bg-background overflow-hidden relative selection:bg-light-signal-orange selection:text-white">
      {/* Ghost Watermark */}
      <div className="absolute top-40 -left-20 text-[12vw] font-bold text-ink-black opacity-[0.03] select-none pointer-events-none whitespace-nowrap animate-ghost">
        SECURITY REDEFINED
      </div>
      <div className="absolute bottom-40 -right-20 text-[12vw] font-bold text-ink-black opacity-[0.03] select-none pointer-events-none whitespace-nowrap animate-ghost" style={{ animationDelay: '0.5s' }}>
        AI POWERED SCAN
      </div>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-pill bg-white border border-ink-black/5 mb-8">
              <span className="w-2 h-2 rounded-full bg-signal-orange" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">
                Enterprise Grade
              </span>
            </div>
            <h1 className="text-6xl md:text-7xl font-medium tracking-tight text-ink-black leading-[1.05] mb-8">
              Find vulnerabilities <br />
              <span className="italic font-serif text-slate-gray">before</span> they find you.
            </h1>
            <p className="text-xl text-slate-gray max-w-lg leading-relaxed mb-12">
              ScanAI delivers deep security intelligence in minutes. 
              Plain-English reports with step-by-step remediation 
              for modern engineering teams.
            </p>
            
            <div className="flex items-center gap-4">
              {loading ? (
                <div className="h-14 w-64 rounded-pill bg-dust-taupe/20 animate-pulse" />
              ) : user ? (
                <ScanInput />
              ) : (
                <div className="flex flex-wrap gap-4">
                  <Link href="/signup">
                    <Button variant="default" size="lg" className="rounded-pill shadow-xl">
                      Start Scanning Free
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="outline" size="lg">
                      View Demo
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="relative animate-orbital hidden lg:block">
            {/* Main Hero Stadium */}
            <div className="relative w-[500px] h-[500px] rounded-full border border-ink-black/5 p-4 mx-auto">
              <div className="relative w-full h-full rounded-full overflow-hidden shadow-2xl">
                <Image
                  src="/assets/shield.png"
                  alt="Security Shield"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-ink-black/40 to-transparent" />
              </div>
              
              {/* Satellite CTA */}
              <div className="absolute bottom-[10%] right-[10%] z-10 animate-satellite">
                <div className="w-16 h-16 rounded-full bg-white shadow-xl flex items-center justify-center group cursor-pointer hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-ink-black group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14m-7-7l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Orbital Arcs */}
            <svg className="absolute -inset-20 w-[120%] h-[120%] pointer-events-none overflow-visible" viewBox="0 0 600 600">
              <path 
                d="M100,300 Q150,100 300,100" 
                className="stroke-light-signal-orange/30 fill-none animate-arc" 
                strokeWidth="1.5" 
              />
              <path 
                d="M300,500 Q500,450 550,200" 
                className="stroke-light-signal-orange/30 fill-none animate-arc" 
                strokeWidth="1.5"
                style={{ animationDelay: '1s' }}
              />
            </svg>
          </div>
        </div>
      </section>

      {/* Feature Grid - Constellation Layout */}
      <section className="py-32 bg-lifted-cream relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-24">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-signal-orange" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">
                Capabilities
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-medium text-ink-black">
              Defense through intelligence.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-24 relative">
            {/* Feature 1 */}
            <div className="group animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="relative w-48 h-48 rounded-full overflow-hidden mb-10 shadow-lg transition-transform group-hover:scale-105">
                <Image src="/assets/ai.png" alt="AI Core" fill className="object-cover" />
                <div className="absolute inset-0 bg-ink-black/10 group-hover:bg-transparent transition-colors" />
                {/* Small Satellite */}
                <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center animate-satellite">
                  <svg className="w-4 h-4 text-ink-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 12h14" />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-medium text-ink-black mb-4">AI Deep Analysis</h3>
              <p className="text-slate-gray leading-relaxed">
                Autonomous agents analyze findings to eliminate false positives 
                and prioritize what matters.
              </p>
            </div>

            {/* Feature 2 - Asymmetric offset */}
            <div className="group animate-fade-in-up md:mt-20" style={{ animationDelay: '0.4s' }}>
              <div className="relative w-64 h-64 rounded-full overflow-hidden mb-10 shadow-xl transition-transform group-hover:scale-105">
                <Image src="/assets/network.png" alt="Network" fill className="object-cover" />
                <div className="absolute inset-0 bg-ink-black/10 group-hover:bg-transparent transition-colors" />
                <div className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center animate-satellite">
                  <svg className="w-5 h-5 text-ink-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M12 5v14m-7-7h14" />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-medium text-ink-black mb-4">Global Recon</h3>
              <p className="text-slate-gray leading-relaxed">
                Connects to 50+ threat intelligence sources to map your 
                attack surface in real-time.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
              <div className="relative w-48 h-48 rounded-full overflow-hidden mb-10 shadow-lg transition-transform group-hover:scale-105">
                <Image src="/assets/vault.png" alt="Vault" fill className="object-cover" />
                <div className="absolute inset-0 bg-ink-black/10 group-hover:bg-transparent transition-colors" />
                <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center animate-satellite">
                  <svg className="w-4 h-4 text-ink-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 12h14m-7-7l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-medium text-ink-black mb-4">Secure Fixes</h3>
              <p className="text-slate-gray leading-relaxed">
                Receive cryptographically signed reports with production-ready 
                remediation code snippets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-40 bg-ink-black text-canvas-cream text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M0,100 C30,40 70,40 100,100" fill="none" stroke="white" strokeWidth="0.1" />
            </svg>
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <h2 className="text-5xl md:text-6xl font-medium mb-12 tracking-tight">
            We&apos;re always here <br /> when you need us.
          </h2>
          <div className="flex justify-center gap-6">
            <Link href="/signup">
              <Button size="lg" className="rounded-pill px-12 bg-canvas-cream text-ink-black hover:bg-white">
                Get Started
              </Button>
            </Link>
            <Button size="lg" variant="ghost" className="text-canvas-cream hover:bg-white/10">
              Contact Support
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

