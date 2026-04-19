import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            // Next.js injects inline <script> tags for hydration bootstrap.
            // Without 'unsafe-inline' on script-src, browsers block them and the
            // page renders but never hydrates (no interactivity, no client routing).
            // TODO: Upgrade to nonce-based CSP via Next.js middleware for tighter
            // protection — see https://nextjs.org/docs/app/guides/content-security-policy
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';"
          },
          {
            key: 'Permissions-Policy',
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()"
          }
        ],
      },
    ];
  },
};

export default nextConfig;
