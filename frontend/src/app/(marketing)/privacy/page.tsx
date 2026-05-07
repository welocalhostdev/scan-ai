export default function PrivacyPage() {
  return (
    <main className="flex-1 bg-background py-32 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-pill bg-white border border-ink-black/5 mb-8 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-signal-orange" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">
            Privacy
          </span>
        </div>
        
        <h1 className="text-5xl font-medium tracking-tight text-ink-black mb-12">
          Privacy Policy
        </h1>

        <div className="prose prose-slate prose-lg max-w-none text-slate-gray space-y-8">
          <section>
            <h2 className="text-2xl font-medium text-ink-black">1. Information We Collect</h2>
            <p>
              We collect information necessary to provide our scanning services, including 
              your email address, name, and the URLs you submit for analysis.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-medium text-ink-black">2. How We Use Data</h2>
            <p>
              Data is used primarily to generate security reports and manage your account. 
              We may use anonymized findings to improve our security detection algorithms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-medium text-ink-black">3. Data Security</h2>
            <p>
              We employ military-grade encryption for all scan data at rest and in transit. 
              Our infrastructure is monitored 24/7 for unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-medium text-ink-black">4. Your Rights</h2>
            <p>
              You have the right to access, export, or delete your account data at any time. 
              Contact support if you wish to exercise these rights.
            </p>
          </section>
          
          <p className="pt-12 text-sm opacity-50 italic">
            Last updated: May 5, 2026
          </p>
        </div>
      </div>
    </main>
  );
}
