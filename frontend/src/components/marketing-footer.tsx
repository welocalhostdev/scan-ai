import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-ink-black/5 bg-canvas-cream">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-ink-black flex items-center justify-center">
                <svg className="w-5 h-5 text-canvas-cream" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span className="font-bold text-lg tracking-tight text-ink-black">ScanAI</span>
            </div>
            <p className="text-sm text-slate-gray max-w-sm leading-relaxed">
              Enterprise-grade vulnerability intelligence for modern engineering teams.
              AI-powered security scanning with actionable remediation.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-xs font-bold tracking-widest uppercase text-ink-black/40 mb-4">Product</h4>
            <ul className="space-y-3">
              <li><Link href="/dashboard" className="text-sm text-slate-gray hover:text-ink-black transition-colors">Dashboard</Link></li>
              <li><Link href="/#features" className="text-sm text-slate-gray hover:text-ink-black transition-colors">Features</Link></li>
              <li><Link href="/#how-it-works" className="text-sm text-slate-gray hover:text-ink-black transition-colors">How it works</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-bold tracking-widest uppercase text-ink-black/40 mb-4">Company</h4>
            <ul className="space-y-3">
              <li><Link href="/login" className="text-sm text-slate-gray hover:text-ink-black transition-colors">Log in</Link></li>
              <li><Link href="/signup" className="text-sm text-slate-gray hover:text-ink-black transition-colors">Sign up</Link></li>
              <li><Link href="/privacy" className="text-sm text-slate-gray hover:text-ink-black transition-colors">Privacy</Link></li>
              <li><Link href="/terms" className="text-sm text-slate-gray hover:text-ink-black transition-colors">Terms</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-ink-black/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-gray/60">
            &copy; {new Date().getFullYear()} ScanAI. All rights reserved.
          </p>
          <p className="text-xs text-slate-gray/60">
            Built for security-conscious teams.
          </p>
        </div>
      </div>
    </footer>
  );
}
