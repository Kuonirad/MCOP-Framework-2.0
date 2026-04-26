import type { MetadataRoute } from "next";

/**
 * Dynamic sitemap.xml for MCOP Framework 2.0.
 *
 * Next.js exposes the file as `/sitemap.xml` automatically when this module
 * default-exports a `MetadataRoute.Sitemap`. The set of advertised URLs is
 * the canonical landing surface (single-page app + the published GitHub
 * docs surface that the page links to). Build-time only — never reads
 * cookies, headers, or request state — so the route is statically
 * generated and safe under `output: "standalone"`.
 *
 * The set of URLs is intentionally minimal: surfacing too many auto-
 * generated routes is the most common source of soft-404 SEO regressions.
 * Add an entry here only when a public, content-bearing route exists.
 *
 * `lastModified` is derived from a build-time constant rather than
 * `Date.now()` so two consecutive deployments with no content changes
 * produce byte-identical sitemap output (important for ETag caching and
 * for generative-search systems that diff sitemaps over time).
 */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://kuonirad.github.io/KullAILABS-MCOP-Framework-2.0"
).replace(/\/$/, "");

/**
 * Stable lastModified anchor — bumped intentionally with significant
 * content changes. Deterministic to keep sitemap output reproducible
 * across CI runs (matches the project's crystalline-determinism ethos).
 */
const LAST_MODIFIED_ISO = "2026-04-26T00:00:00.000Z";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(LAST_MODIFIED_ISO);

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
