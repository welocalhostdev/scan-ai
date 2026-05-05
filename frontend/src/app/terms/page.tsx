export default function TermsPage() {
  return (
    <main className="flex-1 bg-background py-32 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-pill bg-white border border-ink-black/5 mb-8 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-signal-orange" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-ink-black uppercase">
            Legal
          </span>
        </div>
        
        <h1 className="text-5xl font-medium tracking-tight text-ink-black mb-12">
          Terms of Service
        </h1>

        <div className="prose prose-slate prose-lg max-w-none text-slate-gray space-y-8">
          <section>
            <h2 className="text-2xl font-medium text-ink-black">1. Acceptance of Terms</h2>
            <p>
              By accessing or using ScanAI, you agree to be bound by these Terms of Service. 
              Our platform provides automated security scanning and analysis for engineering teams.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-medium text-ink-black">2. Authorized Use</h2>
            <p>
              You represent and warrant that you have the legal authority to scan the targets 
              you submit to ScanAI. Unauthorized scanning of third-party assets without explicit 
              consent is strictly prohibited and may violate local laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-medium text-ink-black">3. Service Limitations</h2>
            <p>
              ScanAI is an automated tool. While we strive for high accuracy, automated scans 
              cannot replace professional manual penetration testing. We are not liable for 
              missed vulnerabilities or false positives.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-medium text-ink-black">4. Data Privacy</h2>
            <p>
              Your scan reports and target data are treated as confidential. We use industry-standard 
              encryption to protect your information. Please refer to our Privacy Policy for more details.
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
