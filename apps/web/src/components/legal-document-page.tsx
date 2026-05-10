import { FileText, ShieldCheck } from "lucide-react";

type LegalSection = {
  title: string;
  body: string;
};

type LegalDocumentPageProps = {
  badge: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
};

export function LegalDocumentPage({ badge, title, intro, updated, sections }: LegalDocumentPageProps) {
  return (
    <main className="mesh-grain-canvas relative min-h-[calc(100vh-76px)] bg-[linear-gradient(90deg,rgba(79,165,182,0.16),rgba(245,243,238,0.98)_38%,rgba(239,90,42,0.12)),linear-gradient(90deg,rgba(20,20,19,0.07)_1px,transparent_1px),#f5f3ee] bg-[length:auto,72px_100%] px-5 pb-24 pt-32 text-[#141413] md:px-14 md:pb-28 md:pt-36">
      <div className="grain-noise absolute inset-0 opacity-25" />
      <div className="relative mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-[340px_1fr]">
        <aside>
          <div className="inline-flex items-center gap-3 border border-black/12 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-black/70 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#ef5a2a]" />
            {badge}
          </div>
          <h1 className="mt-8 text-5xl font-semibold leading-none tracking-[-0.02em] md:text-6xl">{title}</h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-black/62">{intro}</p>
          <div className="mt-10 border border-black/12 bg-white/72 p-5 shadow-sm backdrop-blur">
            <ShieldCheck className="h-5 w-5 text-[#4fa5b6]" />
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Updated</p>
            <p className="mt-2 text-lg font-semibold">{updated}</p>
          </div>
        </aside>

        <article className="border border-black/12 bg-white p-6 shadow-sm md:p-10">
          <div className="mb-8 flex h-12 w-12 items-center justify-center border border-black/12 bg-[#f5f3ee] text-[#4fa5b6]">
            <FileText className="h-6 w-6" />
          </div>
          <div className="divide-y divide-black/10">
            {sections.map((section) => (
              <section key={section.title} className="py-8 first:pt-0 last:pb-0">
                <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#141413]">{section.title}</h2>
                <p className="mt-4 max-w-3xl text-lg leading-8 text-black/64">{section.body}</p>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
