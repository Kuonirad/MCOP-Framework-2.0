import Link from "next/link";

import PerformanceHUD from "@/components/PerformanceHUD";
import TriadVisualizer from "./_components/TriadVisualizer";

/**
 * MCOP Framework Visualizer — production landing page that replaces the
 * Create Next App starter. LCP-optimized: the hero is text-first with a
 * single small SVG accent served as a plain `<img>` carrying
 * `fetchPriority="high"` + `loading="eager"` (the HTML-native equivalent
 * of `next/image priority`).  We avoid the optimizer for this asset
 * because `next.config.ts` deliberately keeps `dangerouslyAllowSVG:
 * false` for CSP reasons; the asset is same-origin, hand-authored, and
 * served with strict immutable cache headers.  Width/height are
 * explicit so the box is reserved before bytes arrive — zero CLS.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://kuonirad.github.io/KullAILABS-MCOP-Framework-2.0";

/**
 * Schema.org `SoftwareApplication` JSON-LD — describes MCOP itself as a
 * software product so generative-search systems can answer "what is
 * MCOP?" with structured fields (license, language, version, audience).
 */
const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}#software`,
  name: "MCOP Framework 2.0",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "AI Orchestration Framework",
  operatingSystem: "Cross-platform (Node.js 20+, Python 3.11+)",
  softwareVersion: "2.1",
  description:
    "Deterministic, auditable Meta-Cognitive Optimization Protocol with NOVA-NEO encoder, Stigmergy v5 resonance store, and Holographic Etch engine. Ships the Universal Adapter Protocol v2.1 for Magnific, Higgsfield, Utopai, and any REST/MCP/HTTP pipeline.",
  url: SITE_URL,
  codeRepository:
    "https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0",
  programmingLanguage: ["TypeScript", "Python"],
  license: "https://mariadb.com/bsl11/",
  isAccessibleForFree: true,
  publisher: { "@id": `${SITE_URL}#organization` },
  author: { "@id": `${SITE_URL}#organization` },
  audience: {
    "@type": "Audience",
    audienceType: "Researchers, ML/AI engineers, platform teams",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

/**
 * Schema.org `TechArticle` JSON-LD — frames the landing page itself as a
 * technical article so search engines + AI crawlers index its
 * authority signals (author, dependencies, proficiency level).
 */
const techArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": `${SITE_URL}#article`,
  headline: "MCOP Framework 2.0 — Deterministic, Auditable Triad Orchestration",
  description:
    "Reference page for the Meta-Cognitive Optimization Protocol's triad architecture, kernel set, Universal Adapter Protocol v2.1, and live Core Web Vitals telemetry.",
  inLanguage: "en",
  url: SITE_URL,
  mainEntityOfPage: SITE_URL,
  proficiencyLevel: "Expert",
  dependencies: "Next.js 16, React 19, TypeScript 5.9, Node.js 20+",
  keywords:
    "MCOP, deterministic AI, stigmergy, holographic etch, Merkle lineage, Universal Adapter Protocol",
  publisher: { "@id": `${SITE_URL}#organization` },
  author: {
    "@type": "Person",
    name: "Kevin Kull (KVN-AI)",
    url: "https://github.com/Kuonirad",
    sameAs: [
      "https://github.com/Kuonirad",
      "https://github.com/KullAILABS/KullAILABS-MCOP-Framework-2.0",
    ],
  },
};

interface AuthorBio {
  readonly name: string;
  readonly handle: string;
  readonly role: string;
  readonly bio: string;
  readonly credentials: ReadonlyArray<{
    readonly label: string;
    readonly href: string;
    readonly verified: boolean;
  }>;
}

/**
 * Author roster surfaced in the E-E-A-T section.  Every credential link
 * resolves to a third-party-verifiable resource (GitHub profile, repo
 * graph, organization page) so readers and crawlers alike can confirm
 * provenance independently.  Marked `verified: true` only when the
 * destination is an official identity surface (GitHub user/org) rather
 * than a self-hosted page.
 */
const AUTHORS: ReadonlyArray<AuthorBio> = [
  {
    name: "Kevin Kull",
    handle: "KVN-AI",
    role: "Principal Architect · MCOP Framework 2.0",
    bio: "Designed the deterministic triad architecture (NOVA-NEO encoder, Stigmergy v5, Holographic Etch) and authored the Universal MCOP Adapter Integration Protocol v2.1. Focus: provably-replayable cognitive systems with cryptographic provenance.",
    credentials: [
      {
        label: "GitHub @Kuonirad",
        href: "https://github.com/Kuonirad",
        verified: true,
      },
      {
        label: "Project commits",
        href: "https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/commits?author=Kuonirad",
        verified: true,
      },
    ],
  },
  {
    name: "KullAI Labs",
    handle: "KullAILABS",
    role: "Stewarding organization",
    bio: "Maintains the public MCOP Framework 2.0 distribution, the Universal Adapter Protocol specification, and the verification surface (CI, CodeQL, Dependabot, all-contributors).",
    credentials: [
      {
        label: "GitHub @KullAILABS",
        href: "https://github.com/KullAILABS",
        verified: true,
      },
      {
        label: "Repository",
        href: "https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0",
        verified: true,
      },
      {
        label: "Governance",
        href: "https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/GOVERNANCE.md",
        verified: true,
      },
    ],
  },
];

export default function Home() {
  const metrics: Array<{ label: string; value: string; hint: string }> = [
    { label: "Entropy target", value: "0.07", hint: "Crystalline determinism" },
    { label: "Resonance", value: "≥ 0.5", hint: "Default cosine threshold" },
    { label: "Confidence floor", value: "0.8", hint: "Adaptive confidence engine" },
    { label: "Trace buffer", value: "O(1)", hint: "Circular-buffer storage" },
  ];

  const kernels: Array<{ title: string; body: string; tone: string }> = [
    {
      title: "NOVA-NEO Encoder",
      body: "Deterministic SHA-256 hashing pipeline producing fixed-dimension tensors with optional L2 normalization and entropy estimates.",
      tone: "from-sky-500/20 to-sky-500/5 ring-sky-400/40",
    },
    {
      title: "Stigmergy v5",
      body: "Vector pheromone store with cosine resonance scoring, configurable thresholds, Merkle-proof chaining, and bounded circular memory.",
      tone: "from-violet-500/20 to-violet-500/5 ring-violet-400/40",
    },
    {
      title: "Holographic Etch",
      body: "Rank-1 micro-etch accumulator guarded by an adaptive confidence engine; skipped submissions land on a dedicated audit ring.",
      tone: "from-emerald-500/20 to-emerald-500/5 ring-emerald-400/40",
    },
  ];

  const adapters: Array<{
    title: string;
    body: string;
    tone: string;
    badge: string;
  }> = [
    {
      title: "Magnific",
      badge: "TypeScript · Image / Video / Upscale / Model Orchestration",
      body: "Brand-aligned image, video, and upscale generation through Magnific's unified v1/ai/ API gateway. Supports Mystic 2.5, Google Veo 3.1, ByteDance Seeddance 2.0. Volumetric pixel-area billing with server-side guardrails.",
      tone: "from-sky-500/20 to-sky-500/5 ring-sky-400/40",
    },
    {
      title: "Higgsfield",
      badge: "Python · Cinematic Video",
      body: "Routes between Kling 3.0, Veo 3.1, Sora 2, and Seedance using a resonance-weighted scorer. Etch Merkle root flows into the SDK's audit parameter.",
      tone: "from-violet-500/20 to-violet-500/5 ring-violet-400/40",
    },
    {
      title: "Utopai",
      badge: "TypeScript · Long-form Narrative",
      body: "Multi-segment script composition with a configurable continuity floor that flags low-resonance beats for human review before dispatch.",
      tone: "from-emerald-500/20 to-emerald-500/5 ring-emerald-400/40",
    },
    {
      title: "Generic Production",
      badge: "TypeScript · Scaffold",
      body: "Twenty-line template for any REST / MCP / HTTP pipeline. Drop in a dispatch function and the framework wires encoder, resonance, dialectical refinement, and provenance.",
      tone: "from-amber-500/20 to-amber-500/5 ring-amber-400/40",
    },
  ];

  return (
    <>
      {/*
       * Page-scoped JSON-LD lives outside `<main>` so it cannot leak into
       * the main-content `script`-free invariant the SSR test harness
       * enforces.  Crawlers consume these scripts from anywhere inside
       * `<body>`, so position is purely a test-suite contract.
       */}
      {/* Performance: preconnect to critical origins to reduce connection setup time */}
      <link rel="preconnect" href="https://github.com" />
      <link rel="dns-prefetch" href="https://github.com" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(techArticleJsonLd),
        }}
      />
      <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,#0b1220_0%,#000000_55%,#020617_100%)] text-slate-100">
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-16 focus:outline-none"
        >
          <header className="flex flex-col gap-6">
            {/*
             * Hero accent — a small (40×40) SVG glyph carrying
             * `fetchPriority="high"` (HTTP priority hint, the HTML
             * spec's analogue to `next/image priority`) and
             * `loading="eager"` so it never lags the H1 paint.
             * Decorative by design — the heading text remains the LCP
             * target.  Width/height are explicit to reserve box and
             * avoid CLS.  An `<img>` rather than `next/image` because
             * `dangerouslyAllowSVG` is intentionally false in
             * `next.config.ts`.
             *
             * SSR contract — React 19 auto-emits a matching
             * `<link rel="preload" as="image" fetchPriority="high">`
             * for any image rendered with `fetchPriority="high"`
             * during the server pass (see
             * https://react.dev/reference/react-dom/components/img#preloading-an-image-with-fetchpriority).
             * The MCOP audit therefore expects `fetchPriority="high"`
             * to appear exactly twice in the SSR HTML — once on this
             * `<img>`, once on the auto-emitted preload `<link>`. The
             * invariant is enforced by `verifyLCPPreload` (see
             * `src/core/testing-utils.ts`) and by the
             * `scripts/verify-ssr-lcp.mjs` SSR validation script.
             */}
            {/* eslint-disable-next-line @next/next/no-img-element -- see comment above */}
            <img
              src="/og-image.svg"
              alt=""
              role="presentation"
              width={40}
              height={40}
              fetchPriority="high"
              loading="eager"
              decoding="async"
              className="h-10 w-10 rounded-full ring-1 ring-white/10"
            />
            <p className="text-xs uppercase tracking-[0.4em] text-sky-300/80">
              Meta-Cognitive Optimization Protocol
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              MCOP Framework{" "}
              <span className="bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
                2.0
              </span>
            </h1>
            <p className="max-w-3xl text-lg text-slate-300 sm:text-xl">
              Deterministic, auditable triad orchestration. Crystalline entropy
              targets, Merkle-tracked pheromones, and rank-1 micro-etches —
              packaged for research, prototyping, and production deployment.
            </p>
            {/*
             * AI-crawler direct-answer block. Labeled with a stable
             * `data-llm-answer` selector + an `aria-labelledby` heading
             * so generative-search systems (Perplexity, ChatGPT browse,
             * Claude search, SGE, You.com) can extract the page's TL;DR
             * verbatim without parsing the surrounding prose. The block
             * is also visible to humans — hidden TL;DRs are
             * E-E-A-T-hostile and bias against accessibility-first
             * design.  See `/llms.txt` for the full curated index.
             */}
            <aside
              data-llm-answer="mcop-framework-tldr"
              aria-labelledby="tldr-heading"
              itemScope
              itemType="https://schema.org/Answer"
              className="max-w-3xl rounded-2xl border border-sky-300/20 bg-sky-300/[0.04] p-5 text-sm leading-relaxed text-slate-100"
            >
              <p
                id="tldr-heading"
                className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-sky-300/80"
              >
                TL;DR — direct answer for AI crawlers
              </p>
              <p itemProp="text">
                <strong>MCOP Framework 2.0</strong> is an open-source
                Meta-Cognitive Optimization Protocol that turns large-language-model
                orchestration into a <em>deterministic, replayable</em> pipeline.
                It composes three kernels — the NOVA-NEO Encoder
                (SHA-256-deterministic context tensors), Stigmergy v5 (cosine
                resonance over a Merkle-chained pheromone store), and the
                Holographic Etch (rank-1 confidence accumulator) — into an
                audit-grade reasoning substrate. Adapters in TypeScript and
                Python (Magnific, Higgsfield, Utopai, plus a generic REST/MCP
                scaffold) wire the triad to creative-production platforms via
                the <strong>Universal Adapter Protocol v2.1</strong>. License:
                BUSL 1.1.
              </p>
            </aside>
            <p className="max-w-3xl text-base text-slate-400">
              Now shipping the{" "}
              <a
                className="text-sky-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 rounded focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Universal MCOP Adapter Integration Protocol v2.1
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              : a single contract that bridges the cognitive triad to Magnific,
              Higgsfield, Utopai, and any generic REST / MCP / HTTP pipeline
              — without touching core.
            </p>
            <nav
              aria-label="Primary"
              className="flex flex-wrap gap-3 pt-2 text-sm font-medium"
            >
              <a
                className="rounded-full bg-white px-5 py-2 text-slate-950 shadow-lg shadow-sky-500/10 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0#readme"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the docs
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                className="rounded-full border border-white/20 px-5 py-2 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0"
                target="_blank"
                rel="noopener noreferrer"
              >
                Source on GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                className="rounded-full border border-white/20 px-5 py-2 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="/api/health"
              >
                Health endpoint
              </a>
            </nav>
          </header>

          <section aria-labelledby="triad-heading" className="flex flex-col gap-6">
            <h2 id="triad-heading" className="text-2xl font-semibold">
              The triad at a glance
            </h2>
            <TriadVisualizer />
          </section>

          <section aria-labelledby="kernels-heading" className="flex flex-col gap-6">
            <h2 id="kernels-heading" className="text-2xl font-semibold">
              Active kernels
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {kernels.map((k) => (
                <article
                  key={k.title}
                  className={`rounded-2xl bg-gradient-to-br ${k.tone} p-6 ring-1 backdrop-blur`}
                >
                  <h3 className="text-lg font-semibold">{k.title}</h3>
                  <p className="mt-2 text-sm text-slate-200/80">{k.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="adapters-heading" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-[0.4em] text-sky-300/80">
                Adapter Protocol v2.1
              </p>
              <h2 id="adapters-heading" className="text-2xl font-semibold">
                Plug into any creative platform
              </h2>
              <p className="max-w-3xl text-sm text-slate-300/80">
                Each adapter encodes the prompt, queries Stigmergy for prior
                resonance, runs the dialectical synthesizer for human-in-the-loop
                refinement, etches a Merkle root for replay, and dispatches to
                the vendor SDK — all behind a uniform{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
                  IMCOPAdapter
                </code>{" "}
                contract.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {adapters.map((a) => (
                <article
                  key={a.title}
                  className={`rounded-2xl bg-gradient-to-br ${a.tone} p-6 ring-1 backdrop-blur`}
                >
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-300/70">
                    {a.badge}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm text-slate-200/80">{a.body}</p>
                </article>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-medium">
              <Link
                className="rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1.5 transition hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="/dialectical"
              >
                Open Dialectical Studio
              </Link>
              <a
                className="rounded-full border border-white/20 px-4 py-1.5 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the spec
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                className="rounded-full border border-white/20 px-4 py-1.5 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/tree/main/examples"
                target="_blank"
                rel="noopener noreferrer"
              >
                Browse runnable examples
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                className="rounded-full border border-white/20 px-4 py-1.5 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/tree/main/src/adapters"
                target="_blank"
                rel="noopener noreferrer"
              >
                TypeScript adapters
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                className="rounded-full border border-white/20 px-4 py-1.5 transition hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/tree/main/mcop_package/mcop/adapters"
                target="_blank"
                rel="noopener noreferrer"
              >
                Python adapters
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </section>

          <section aria-labelledby="metrics-heading" className="flex flex-col gap-6">
            <h2 id="metrics-heading" className="text-2xl font-semibold">
              Live defaults
            </h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <dt className="text-xs uppercase tracking-wider text-slate-400">
                    {m.label}
                  </dt>
                  <dd className="mt-1 font-mono text-2xl">{m.value}</dd>
                  <p className="mt-1 text-xs text-slate-400">{m.hint}</p>
                </div>
              ))}
            </dl>
          </section>

          {/*
           * E-E-A-T author surface — Google's "Experience, Expertise,
           * Authoritativeness, Trust" signals are reinforced by visible,
           * verifiable author bios linked to third-party identity
           * surfaces (GitHub).  Pairs with the `Person` JSON-LD authored
           * in `techArticleJsonLd` for machine-readable parity.
           */}
          <section aria-labelledby="authors-heading" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-[0.4em] text-sky-300/80">
                Authorship & provenance
              </p>
              <h2 id="authors-heading" className="text-2xl font-semibold">
                Who built this and how to verify them
              </h2>
              <p className="max-w-3xl text-sm text-slate-300/80">
                Every credential below resolves to a third-party identity
                surface so readers can independently confirm authorship and
                stewardship. Provenance — not assertion — is the standard MCOP
                holds itself to.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {AUTHORS.map((author) => (
                <article
                  key={author.name}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
                  itemScope
                  itemType="https://schema.org/Person"
                >
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-300/70">
                    {author.role}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold" itemProp="name">
                    {author.name}{" "}
                    <span className="text-sm font-normal text-slate-400">
                      <span itemProp="alternateName">@{author.handle}</span>
                    </span>
                  </h3>
                  <p
                    className="mt-2 text-sm text-slate-200/80"
                    itemProp="description"
                  >
                    {author.bio}
                  </p>
                  <ul className="mt-4 flex flex-wrap gap-2 text-xs">
                    {author.credentials.map((c) => (
                      <li key={c.href}>
                        <a
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 transition hover:border-sky-300/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                          href={c.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          itemProp="sameAs"
                          aria-label={`${c.label}${c.verified ? " (verified third-party identity)" : ""} (opens in a new tab)`}
                        >
                          {c.verified && (
                            <span
                              aria-hidden="true"
                              className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/60"
                            />
                          )}
                          {c.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-slate-400">
            <span>© {new Date().getFullYear()} KullAI Labs · BUSL 1.1 licensed</span>
            <div className="flex gap-4">
              <a
                className="hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 rounded focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/ARCHITECTURE.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Architecture
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                className="hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 rounded focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/SECURITY.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Security
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                className="hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 rounded focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                href="https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contributing
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </footer>
        </main>
        <PerformanceHUD />
      </div>
    </>
  );
}
