import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutShiftAnnouncer from "@/components/LayoutShiftAnnouncer";
import WebVitalsSentinel from "./_components/WebVitalsSentinel";

/**
 * Font Performance Optimizer — preload primary typefaces and defer paint
 * swap so the first meaningful paint is never held by font downloads. The
 * `display: 'swap'` directive guarantees an immediate fallback render while
 * `preload: true` pushes the critical font byte range ahead of the LCP fetch.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: true,
});

/**
 * Canonical site URL.  Resolved from `NEXT_PUBLIC_SITE_URL` so preview
 * deployments (Vercel, Netlify, Render, etc.) can advertise their own
 * canonical without re-builds; falls back to the production GitHub
 * Pages mirror so OG/Twitter image URLs stay absolute even in local dev.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://kuonirad.github.io/MCOP-Framework-2.0";

const SITE_NAME = "MCOP Framework 2.0";
const SITE_DESCRIPTION =
  "Meta-Cognitive Optimization Protocol — deterministic, auditable triad orchestration with crystalline entropy, Merkle-tracked pheromones, and rank-1 holographic etches.";

/**
 * Viewport configuration is exported separately per Next 15+ Metadata API
 * conventions.  `themeColor` matches the page gradient base so iOS / Android
 * chrome shells blend seamlessly with the dark radial aesthetic.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
    { media: "(prefers-color-scheme: light)", color: "#020617" },
  ],
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Meta-Cognitive Optimization Protocol`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: [
    "MCOP",
    "Meta-Cognitive Optimization Protocol",
    "cognitive optimization",
    "deterministic AI",
    "auditable AI",
    "triad orchestration",
    "stigmergy",
    "holographic etch",
    "NOVA-NEO encoder",
    "Merkle lineage",
    "Universal Adapter Protocol",
    "Next.js 16",
    "React 19",
  ],
  authors: [
    {
      name: "Kevin Kull (KVN-AI)",
      url: "https://github.com/Kuonirad",
    },
    {
      name: "KullAI Labs",
      url: "https://github.com/KullAILABS",
    },
  ],
  creator: "KullAI Labs",
  publisher: "KullAI Labs",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Deterministic, Auditable Triad Orchestration`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Universal Adapter Protocol v2.1`,
        type: "image/svg+xml",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Deterministic, Auditable Triad Orchestration`,
    description: SITE_DESCRIPTION,
    images: ["/og-image.svg"],
    creator: "@KullAILABS",
    site: "@KullAILABS",
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
};

/**
 * Schema.org `Organization` JSON-LD — the canonical structured-data
 * record search engines (and generative-search systems like SGE,
 * Perplexity, ChatGPT browse, Claude search, You.com) consume to attach
 * authority + provenance to every article/page on the site.
 *
 * Kept inline (not in a `.json` file) so the document arrives complete
 * on first request — a fetch for structured data after HTML parse would
 * cost a round trip and a re-render for the crawler.
 */
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}#organization`,
  name: "KullAI Labs",
  legalName: "KullAI Labs",
  url: SITE_URL,
  logo: `${SITE_URL}/og-image.svg`,
  sameAs: [
    "https://github.com/KullAILABS",
    "https://github.com/Kuonirad",
    "https://github.com/Kuonirad/MCOP-Framework-2.0",
  ],
  founder: {
    "@type": "Person",
    name: "Kevin Kull",
    alternateName: "KVN-AI",
    url: "https://github.com/Kuonirad",
    sameAs: ["https://github.com/Kuonirad"],
  },
  knowsAbout: [
    "Meta-Cognitive Optimization",
    "Deterministic AI Systems",
    "Stigmergic Coordination",
    "Holographic Memory Systems",
    "Auditable AI Provenance",
  ],
};

/**
 * Schema.org `Person` JSON-LD — top-level author attribution for
 * Kevin Kull (KVN-AI). Strengthens E-E-A-T (Experience, Expertise,
 * Authoritativeness, Trustworthiness) by giving generative-search
 * systems a structured, third-party-verifiable author identity to
 * attach to articles authored by this Person. The author bio cards
 * on the landing page already carry `Person` microdata via
 * `itemScope`/`itemProp`; this script adds an equivalent JSON-LD
 * record so JSON-only crawlers (which ignore microdata) can still
 * resolve the same identity graph.
 *
 * `sameAs` lists are deliberately limited to identity surfaces the
 * subject controls (GitHub user/org pages) — no marketing/social
 * profiles that could be impersonated.
 */
const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${SITE_URL}#person-kevinkull`,
  name: "Kevin Kull",
  alternateName: "KVN-AI",
  url: "https://github.com/Kuonirad",
  jobTitle: "Principal Architect, MCOP Framework 2.0",
  worksFor: { "@id": `${SITE_URL}#organization` },
  knowsAbout: [
    "Meta-Cognitive Optimization Protocol",
    "Deterministic AI Systems",
    "Cryptographic Provenance",
    "Stigmergic Coordination",
    "Holographic Memory Architectures",
  ],
  sameAs: [
    "https://github.com/Kuonirad",
    "https://github.com/Kuonirad/MCOP-Framework-2.0/commits?author=Kuonirad",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-foreground focus:rounded-md"
        >
          Skip to main content
        </a>
        {children}
        {/*
         * Always-mounted, screen-reader-only announcer that voices VSI
         * status transitions to assistive tech even when the visual HUD
         * panel is closed.  See `LayoutShiftAnnouncer` for the WCAG
         * 4.1.3 rationale and the reduced-motion gating.
         */}
        <LayoutShiftAnnouncer />
        <WebVitalsSentinel />
        {/*
         * Organization JSON-LD lives at the document tail so it never
         * blocks first paint, but inside `<body>` (not `<head>`) so
         * Next's streaming RSC pipeline can flush it without
         * coordination with the head merge.
         */}
        {/*
         * Structured data is generated server-side from a typed object
         * literal, so the only "html" we serialise is JSON we control
         * end-to-end.  No `react/no-danger` suppression needed — the
         * project's ESLint config does not flag this script tag.
         */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(personJsonLd),
          }}
        />
      </body>
    </html>
  );
}
