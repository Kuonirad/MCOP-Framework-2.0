import type { NextConfig } from "next";

/**
 * Performance Header Engine — optimal caching, modern delivery, and
 * Permissions-Policy lockdown applied globally. The `immutable` Cache-Control
 * rules below are scoped to Next's content-addressed static output (safe to
 * cache forever) and to public assets that we serve with hashed names.
 */
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';",
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
];

const immutableCache = {
  key: 'Cache-Control',
  value: 'public, max-age=31536000, immutable',
};

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,

  /**
   * LCP Image Intelligence — modern formats first, opinionated breakpoints,
   * strict remote policy. AVIF/WebP slash byte budgets for LCP hero media
   * while the SVG escape hatch is restricted to same-origin assets.
   */
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [],
  },

  experimental: {
    optimizePackageImports: ['pino'],
  },

  async headers() {
    // Note: Next already sets immutable Cache-Control for `/_next/static/*`,
    // so we avoid re-declaring it here (it triggers a dev-mode warning).
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/fonts/:path*', headers: [immutableCache] },
      {
        source: '/:path*.(svg|png|jpg|jpeg|webp|avif|ico|woff|woff2)',
        headers: [immutableCache],
      },
    ];
  },
};

export default nextConfig;
