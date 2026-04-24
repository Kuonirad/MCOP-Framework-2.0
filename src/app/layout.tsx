import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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

export const metadata: Metadata = {
  title: "MCOP Framework 2.0 | Meta-Cognitive Optimization Protocol",
  description:
    "Advanced framework for cognitive enhancement and system optimization with crystalline entropy state, perfect confidence calibration, and dialectical synthesis.",
  keywords: ["MCOP", "cognitive optimization", "meta-cognitive", "framework", "Next.js"],
  authors: [{ name: "KullAI Labs" }],
  openGraph: {
    title: "MCOP Framework 2.0",
    description:
      "Meta-Cognitive Optimization Protocol — deterministic, auditable triad orchestration.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
        <WebVitalsSentinel />
      </body>
    </html>
  );
}
