export type MarketingPageGroup = "product" | "teams" | "resources";

export type MarketingPage = {
  group: MarketingPageGroup;
  slug: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  command: string;
  outcomes: string[];
  workflow: string[];
  proof: string;
  cta: string;
};

export const marketingPages = {
  product: {
    "attack-surface": {
      group: "product",
      slug: "attack-surface",
      label: "Attack surface",
      eyebrow: "Product / Attack surface",
      title: "See what is reachable before attackers do.",
      description:
        "Map domains, paths, exposed services, headers, TLS posture, and API hints from one external target.",
      command: "scanai surface --map",
      outcomes: ["Reachable assets grouped by priority", "Fresh scan launch from any target URL", "Clean evidence for engineering review"],
      workflow: ["Add a target", "Scan reachable routes", "Review retained exposure"],
      proof: "Built for teams that need a quick outside-in view without opening five separate tools.",
      cta: "Map your surface",
    },
    "ai-triage": {
      group: "product",
      slug: "ai-triage",
      label: "AI triage",
      eyebrow: "Product / AI triage",
      title: "Turn scanner noise into reviewable risk.",
      description:
        "Cluster findings by impact, explain why they matter, and keep reviewers focused on the issues worth fixing first.",
      command: "scanai triage --risk-first",
      outcomes: ["Severity and category grouping", "Plain-language risk explanations", "Noise reduction before report handoff"],
      workflow: ["Collect findings", "Group by risk", "Send the right fix prompt"],
      proof: "AI triage helps product security move faster without hiding the underlying evidence.",
      cta: "Triage findings",
    },
    reports: {
      group: "product",
      slug: "reports",
      label: "Reports",
      eyebrow: "Product / Reports",
      title: "Professional PDF handoffs for real remediation.",
      description:
        "Export sharp B2B reports with evidence, impact, priority, and fix guidance that engineers can act on.",
      command: "scanai report --pdf",
      outcomes: ["Executive summary", "Finding-by-finding evidence", "Owner-ready remediation prompts"],
      workflow: ["Complete scan", "Generate report", "Share remediation bundle"],
      proof: "Reports are designed for action, not just archive storage.",
      cta: "Preview reports",
    },
    "continuous-scans": {
      group: "product",
      slug: "continuous-scans",
      label: "Continuous scans",
      eyebrow: "Product / Continuous scans",
      title: "Keep external exposure under review.",
      description:
        "Monitor targets over time and catch new reachable routes, failed scans, and report-ready changes.",
      command: "scanai monitor --continuous",
      outcomes: ["Recurring scan visibility", "Failed scan attention queue", "Trend and posture snapshots"],
      workflow: ["Set target", "Track changes", "Review new risk"],
      proof: "Continuous scanning keeps security review close to product change.",
      cta: "Start monitoring",
    },
  },
  teams: {
    startup: {
      group: "teams",
      slug: "startup",
      label: "Startup",
      eyebrow: "Teams / Startup",
      title: "Security scanning for teams moving fast.",
      description:
        "Find obvious external risk, generate reports, and answer security questions without building a full security function first.",
      command: "scanai team --startup",
      outcomes: ["Fast first-pass exposure checks", "Founder-friendly remediation summaries", "Reports for customers and partners"],
      workflow: ["Run first scan", "Fix top risks", "Share proof of progress"],
      proof: "Startups get useful security signal without slowing product momentum.",
      cta: "Scan your first target",
    },
    midmarket: {
      group: "teams",
      slug: "midmarket",
      label: "Midmarket",
      eyebrow: "Teams / Midmarket",
      title: "A repeatable scan workflow for growing teams.",
      description:
        "Centralize external scans, findings, and PDF handoffs as more apps, domains, and owners enter the picture.",
      command: "scanai team --midmarket",
      outcomes: ["Shared scan dashboard", "Owner-ready triage", "Consistent reporting across assets"],
      workflow: ["Standardize targets", "Prioritize findings", "Track remediation"],
      proof: "Midmarket teams need repeatability as much as speed.",
      cta: "Standardize scans",
    },
    enterprise: {
      group: "teams",
      slug: "enterprise",
      label: "Enterprise",
      eyebrow: "Teams / Enterprise",
      title: "External security signal for complex portfolios.",
      description:
        "Support portfolio-wide visibility, evidence retention, and executive-ready reporting for larger product organizations.",
      command: "scanai team --enterprise",
      outcomes: ["Portfolio-level posture views", "Report archives for completed scans", "Cleaner escalation to engineering teams"],
      workflow: ["Map assets", "Review risk", "Export evidence"],
      proof: "Enterprise programs need clear handoffs that survive audits, ownership changes, and scale.",
      cta: "Review enterprise workflow",
    },
    agencies: {
      group: "teams",
      slug: "agencies",
      label: "Agencies",
      eyebrow: "Teams / Agencies",
      title: "Security scanning for client delivery.",
      description:
        "Give clients clear evidence, concise reports, and practical fix prompts without building every scan deliverable by hand.",
      command: "scanai team --agency",
      outcomes: ["Client-ready scan summaries", "Reusable report workflow", "Evidence organized by affected asset"],
      workflow: ["Add client target", "Generate report", "Deliver fixes"],
      proof: "Agencies can turn security checks into repeatable deliverables.",
      cta: "Build client report",
    },
  },
  resources: {
    "security-guide": {
      group: "resources",
      slug: "security-guide",
      label: "Security guide",
      eyebrow: "Resources / Security guide",
      title: "A practical guide to external web risk.",
      description:
        "Understand what to check first: reachable admin paths, TLS posture, headers, API hints, and exposure patterns.",
      command: "scanai guide --external-risk",
      outcomes: ["External scan checklist", "Risk priority model", "Evidence language for reports"],
      workflow: ["Map surface", "Confirm evidence", "Fix highest impact"],
      proof: "Good security review starts with clear scope and reproducible evidence.",
      cta: "Read the guide",
    },
    "api-scanning": {
      group: "resources",
      slug: "api-scanning",
      label: "API scanning",
      eyebrow: "Resources / API scanning",
      title: "Find exposed API signals before they become incidents.",
      description:
        "Look for API documentation, routes, headers, unauthenticated responses, and signals that deserve deeper review.",
      command: "scanai api --signals",
      outcomes: ["API route discovery", "Documentation exposure checks", "Auth and header signal review"],
      workflow: ["Discover endpoints", "Classify signals", "Escalate risky behavior"],
      proof: "API scanning is most useful when it separates visible evidence from assumptions.",
      cta: "Review API signals",
    },
    "remediation-playbook": {
      group: "resources",
      slug: "remediation-playbook",
      label: "Remediation playbook",
      eyebrow: "Resources / Remediation playbook",
      title: "Move from finding to fix without losing context.",
      description:
        "Use evidence, impact, and concrete acceptance criteria to turn scanner findings into engineering work.",
      command: "scanai fix --playbook",
      outcomes: ["Fix prompt structure", "Acceptance criteria examples", "Evidence-to-ticket handoff"],
      workflow: ["Explain impact", "Name owner action", "Verify fix"],
      proof: "Remediation is faster when every finding includes the why, where, and done definition.",
      cta: "Use the playbook",
    },
    docs: {
      group: "resources",
      slug: "docs",
      label: "Docs",
      eyebrow: "Resources / Docs",
      title: "ScanAI documentation for operators and engineers.",
      description:
        "Learn the scan flow, dashboard pages, report exports, and safe interpretation of automated findings.",
      command: "scanai docs --open",
      outcomes: ["Scan lifecycle overview", "Dashboard and report reference", "Safe usage guidance"],
      workflow: ["Choose target", "Run scan", "Review report"],
      proof: "Docs keep the workflow clear for security reviewers and the engineers receiving fixes.",
      cta: "Open docs",
    },
  },
} as const satisfies Record<MarketingPageGroup, Record<string, MarketingPage>>;

export const marketingFooterColumns = [
  {
    title: "Product",
    links: [
      marketingPages.product["attack-surface"],
      marketingPages.product["ai-triage"],
      marketingPages.product.reports,
      marketingPages.product["continuous-scans"],
    ],
  },
  {
    title: "Teams",
    links: [
      marketingPages.teams.startup,
      marketingPages.teams.midmarket,
      marketingPages.teams.enterprise,
      marketingPages.teams.agencies,
    ],
  },
  {
    title: "Resources",
    links: [
      marketingPages.resources["security-guide"],
      marketingPages.resources["api-scanning"],
      marketingPages.resources["remediation-playbook"],
      marketingPages.resources.docs,
    ],
  },
];

const marketingPageLookup: Record<MarketingPageGroup, Record<string, MarketingPage>> = marketingPages;

export function getMarketingPage(group: MarketingPageGroup, slug: string) {
  return marketingPageLookup[group][slug];
}

export function getMarketingHref(page: Pick<MarketingPage, "group" | "slug">) {
  return `/${page.group}/${page.slug}`;
}

export function getMarketingStaticParams(group: MarketingPageGroup) {
  return Object.keys(marketingPageLookup[group]).map((slug) => ({ slug }));
}
